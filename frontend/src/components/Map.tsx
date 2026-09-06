import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { RouteData, IncidentReport } from '../types';
import heatmapsGeoJson from '../mocks/heatmaps.json';

interface MapProps {
  routes: RouteData[];
  selectedRouteId: string;
  onSelectRoute: (routeId: string) => void;
  showHeatmap: boolean;
  showAmenities: boolean;
  incidents: IncidentReport[];
  isPinningMode: boolean;
  onMapClickPin?: (coords: { lat: number; lon: number }) => void;
  originCoords?: [number, number];
  destCoords?: [number, number];
  originName?: string;
  destName?: string;
}

export const Map: React.FC<MapProps> = ({
  routes,
  selectedRouteId,
  onSelectRoute,
  showHeatmap,
  showAmenities,
  incidents,
  isPinningMode,
  onMapClickPin,
  originCoords = [73.8446, 18.5314],
  destCoords = [73.8553, 18.4529],
  originName = 'Shivajinagar Station',
  destName = 'Katraj Chowk',
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  const originMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);
  const incidentMarkersRef = useRef<maplibregl.Marker[]>([]);
  const amenityMarkersRef = useRef<maplibregl.Marker[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const hasAnimatedSafestRef = useRef<boolean>(false);

  // Key Pune amenities for visual context
  const keyAmenities = [
    { name: 'Sancheti Trauma Hospital', lat: 18.5285, lon: 73.8505, type: 'hospital' },
    { name: 'Deenanath Mangeshkar Hospital', lat: 18.5025, lon: 73.8325, type: 'hospital' },
    { name: 'Bharati Hospital Katraj', lat: 18.4580, lon: 73.8540, type: 'hospital' },
    { name: 'Shivajinagar Police Chowki', lat: 18.5310, lon: 73.8450, type: 'police' },
    { name: 'Swargate Traffic Chowki', lat: 18.5015, lon: 73.8590, type: 'police' },
    { name: 'Kothrud Police Station', lat: 18.5070, lon: 73.8050, type: 'police' },
  ];

  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);

  // Fallback vector style if CartoDB tile server is unreachable or offline
  const offlineFallbackStyle: maplibregl.StyleSpecification = {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'offline-bg-layer',
        type: 'background',
        paint: {
          'background-color': '#090d16',
        },
      },
    ],
  };

  // Progressive line-drawing animation for Safest Route when selected (single moment of motion)
  const animateSafestRoute = (map: maplibregl.Map, safestRoute: RouteData) => {
    const sourceId = `route-source-${safestRoute.id}`;
    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;

    const fullCoords = safestRoute.geometry.coordinates;
    if (!fullCoords || fullCoords.length < 2) return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const duration = 1200; // 1.2s smooth purposeful draw
    let startTime: number | null = null;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1.0);

      // Cubic ease-out curve
      const ease = 1 - Math.pow(1 - progress, 3);
      const targetCount = Math.max(2, Math.floor(ease * fullCoords.length));
      const currentCoords = fullCoords.slice(0, targetCount);

      source.setData({
        type: 'Feature',
        properties: {
          id: safestRoute.id,
          name: safestRoute.name,
          color: safestRoute.color,
          rss: safestRoute.rss,
        },
        geometry: {
          type: 'LineString',
          coordinates: currentCoords,
        },
      });

      if (progress < 1.0) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);
  };

  const setupMapContent = (map: maplibregl.Map) => {
    if (map.getSource('risk-heatmap-src')) return;

    // 1. Add Risk Heatmap Source & Layer (Calibrated opacity so streets remain readable)
    map.addSource('risk-heatmap-src', {
      type: 'geojson',
      data: heatmapsGeoJson as any,
    });

    map.addLayer({
      id: 'risk-heatmap-layer',
      type: 'heatmap',
      source: 'risk-heatmap-src',
      maxzoom: 16,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'intensity'], 0, 0, 1, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 14, 1.6],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(0, 0, 0, 0)',
          0.2, 'rgba(6, 182, 212, 0.3)',
          0.4, 'rgba(16, 185, 129, 0.55)',
          0.6, 'rgba(245, 158, 11, 0.75)',
          0.8, 'rgba(239, 68, 68, 0.85)',
          1.0, 'rgba(255, 0, 50, 0.95)'
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 14, 14, 28],
        'heatmap-opacity': 0.65, // Calibrated: does not obscure routes
      },
      layout: {
        visibility: showHeatmap ? 'visible' : 'none',
      },
    });

    // 2. Add Route Polyline Sources and Layers with Colorblind-Differentiated Styles
    routes.forEach((route) => {
      const sourceId = `route-source-${route.id}`;
      const casingId = `route-casing-${route.id}`;
      const lineId = `route-line-${route.id}`;

      const isSelected = route.id === selectedRouteId;
      const isSafest = route.type === 'safest';
      const isBalanced = route.type === 'balanced';
      const isFastest = route.type === 'fastest';

      // Accessible Multi-Channel Differentiation:
      // Safest: Heavy Solid (8.0px / 6.0px) - Vivid Teal #2dd4bf
      // Balanced: Medium Dashed [4, 2.5] (6.2px / 4.5px) - Warm Gold #f59e0b
      // Fastest: Light Dotted [1.5, 2] (4.5px / 3.0px) - Ultramarine Blue #38bdf8
      const baseWidth = isSafest ? 6.0 : (isBalanced ? 4.5 : 3.0);
      const selWidth = isSafest ? 8.0 : (isBalanced ? 6.2 : 4.5);
      const currentWidth = isSelected ? selWidth : baseWidth;
      const casingWidth = currentWidth + (isSelected ? 5.5 : 4.0);

      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {
            id: route.id,
            name: route.name,
            color: route.color,
            rss: route.rss,
          },
          geometry: route.geometry,
        },
      });

      // Dark High-Contrast Casing Halo: floats cleanly above heatmap & streets
      map.addLayer({
        id: casingId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#030712',
          'line-width': casingWidth,
          'line-opacity': 0.95,
        },
      });

      // Primary polyline with distinct dash arrays
      const linePaint: Record<string, any> = {
        'line-color': route.color,
        'line-width': currentWidth,
        'line-opacity': isSelected ? 1.0 : 0.65,
      };

      if (isBalanced) {
        linePaint['line-dasharray'] = [4, 2.5]; // Long dash
      } else if (isFastest) {
        linePaint['line-dasharray'] = [1.5, 2]; // Dotted
      }
      // Safest has no line-dasharray -> 100% Solid

      map.addLayer({
        id: lineId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: linePaint,
      });

      // Interactive cursor & click on polyline
      map.on('mouseenter', lineId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', lineId, () => {
        map.getCanvas().style.cursor = isPinningMode ? 'crosshair' : '';
      });

      map.on('click', lineId, (e) => {
        if (isPinningMode && onMapClickPin) {
          onMapClickPin({ lat: e.lngLat.lat, lon: e.lngLat.lng });
        } else if (!isPinningMode) {
          onSelectRoute(route.id);
        }
      });
    });

    // Fit bounds to cover all routes
    fitRouteBounds(map, routes);

    // Initial progressive line-draw if Safest is selected on load
    const safest = routes.find((r) => r.type === 'safest');
    if (safest && selectedRouteId === safest.id && !hasAnimatedSafestRef.current) {
      hasAnimatedSafestRef.current = true;
      animateSafestRoute(map, safest);
    }
  };

  // Initialize Map with offline tile server failure recovery
  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return;

    // Center of Pune (between Shivajinagar & Katraj)
    const puneCenter: [number, number] = [73.848, 18.492];

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: puneCenter,
      zoom: 12.2,
      pitch: 25,
      bearing: -5,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      setupMapContent(map);
    });

    // Error recovery: switch to offline fallback style if tile server is unreachable
    map.on('error', (e) => {
      const errStr = e.error?.message || '';
      if (errStr.includes('style') || errStr.includes('fetch') || errStr.includes('Failed') || errStr.includes('tile')) {
        setIsOfflineMode(true);
        if (!map.isStyleLoaded()) {
          try {
            map.setStyle(offlineFallbackStyle);
            map.once('style.load', () => {
              setupMapContent(map);
            });
          } catch (err) {
            console.warn('[MapLibre] Fallback style switch:', err);
          }
        }
      }
    });

    // Map click for pinning incident
    map.on('click', (e) => {
      if (isPinningMode && onMapClickPin) {
        onMapClickPin({ lat: e.lngLat.lat, lon: e.lngLat.lng });
      }
    });

    mapInstance.current = map;

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  // Update cursor on pinning mode
  useEffect(() => {
    if (!mapInstance.current) return;
    mapInstance.current.getCanvas().style.cursor = isPinningMode ? 'crosshair' : '';
  }, [isPinningMode]);

  // Update Route selection visual styling
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.isStyleLoaded()) return;

    routes.forEach((route) => {
      const isSelected = route.id === selectedRouteId;
      const isSafest = route.type === 'safest';
      const isBalanced = route.type === 'balanced';

      const baseWidth = isSafest ? 6.0 : (isBalanced ? 4.5 : 3.0);
      const selWidth = isSafest ? 8.0 : (isBalanced ? 6.2 : 4.5);
      const currentWidth = isSelected ? selWidth : baseWidth;
      const casingWidth = currentWidth + (isSelected ? 5.5 : 4.0);

      const lineId = `route-line-${route.id}`;
      const casingId = `route-casing-${route.id}`;

      if (map.getLayer(casingId)) {
        map.setPaintProperty(casingId, 'line-width', casingWidth);
        if (isSelected) {
          map.moveLayer(casingId);
        }
      }

      if (map.getLayer(lineId)) {
        map.setPaintProperty(lineId, 'line-width', currentWidth);
        map.setPaintProperty(lineId, 'line-opacity', isSelected ? 1.0 : 0.65);
        if (isSelected) {
          map.moveLayer(lineId);
        }
      }
    });

    // Single moment of motion: draw safest route along path when selected
    const safest = routes.find((r) => r.type === 'safest');
    if (safest && selectedRouteId === safest.id) {
      animateSafestRoute(map, safest);
    }
  }, [selectedRouteId, routes]);

  // Update Heatmap visibility (placed below routes)
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getLayer('risk-heatmap-layer')) {
      map.setLayoutProperty('risk-heatmap-layer', 'visibility', showHeatmap ? 'visible' : 'none');
    }
  }, [showHeatmap]);

  // Update Origin and Destination custom markers (High-contrast, zero animation noise)
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    if (!originMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'origin-marker';
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div class="w-8 h-8 rounded-full bg-teal-400 border-2 border-slate-950 shadow-2xl flex items-center justify-center text-slate-950 font-display font-extrabold text-xs">
            A
          </div>
        </div>
      `;
      originMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(originCoords)
        .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(`<div class="font-bold text-xs text-teal-300">Origin: ${originName}</div>`))
        .addTo(map);
    } else {
      originMarkerRef.current.setLngLat(originCoords);
      originMarkerRef.current.setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(`<div class="font-bold text-xs text-teal-300">Origin: ${originName}</div>`));
    }

    if (!destMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'dest-marker';
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div class="w-8 h-8 rounded-full bg-rose-500 border-2 border-slate-950 shadow-2xl flex items-center justify-center text-white font-display font-extrabold text-xs">
            B
          </div>
        </div>
      `;
      destMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(destCoords)
        .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(`<div class="font-bold text-xs text-rose-300">Destination: ${destName}</div>`))
        .addTo(map);
    } else {
      destMarkerRef.current.setLngLat(destCoords);
      destMarkerRef.current.setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(`<div class="font-bold text-xs text-rose-300">Destination: ${destName}</div>`));
    }
  }, [originCoords, destCoords, originName, destName]);

  // Update Safety Amenities Markers
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    // Remove existing
    amenityMarkersRef.current.forEach((m) => m.remove());
    amenityMarkersRef.current = [];

    if (showAmenities) {
      keyAmenities.forEach((item) => {
        const el = document.createElement('div');
        const isHosp = item.type === 'hospital';
        el.className = 'amenity-marker';
        el.innerHTML = `
          <div class="px-2 py-1 rounded-full text-[10px] font-bold border shadow-lg flex items-center gap-1 backdrop-blur-md ${
            isHosp
              ? 'bg-pink-950/80 text-pink-300 border-pink-500/50'
              : 'bg-cyan-950/80 text-cyan-300 border-cyan-500/50'
          }">
            <span>${isHosp ? '🏥' : '🚓'}</span>
            <span>${item.name}</span>
          </div>
        `;
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([item.lon, item.lat])
          .addTo(map);
        amenityMarkersRef.current.push(marker);
      });
    }
  }, [showAmenities]);

  // Update Incident markers
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    incidentMarkersRef.current.forEach((m) => m.remove());
    incidentMarkersRef.current = [];

    incidents.forEach((inc) => {
      const el = document.createElement('div');
      el.className = 'incident-marker';
      el.innerHTML = `
        <div class="relative flex items-center justify-center cursor-pointer group">
          <span class="animate-ping absolute inline-flex h-6 w-6 rounded-full bg-amber-400 opacity-75"></span>
          <div class="relative w-6 h-6 rounded-full bg-amber-500 border border-slate-900 shadow-xl flex items-center justify-center text-slate-950 font-extrabold text-[11px]">
            ⚠️
          </div>
        </div>
      `;
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([inc.lon, inc.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 12 }).setHTML(`
            <div class="space-y-1">
              <div class="text-xs font-bold text-amber-400 uppercase tracking-wide">Reported Hazard</div>
              <div class="text-xs font-medium text-slate-200">${inc.category.replace('_', ' ')} (Sev: ${inc.severity}/5)</div>
              <div class="text-[11px] text-slate-400">${inc.description}</div>
              <div class="text-[10px] text-slate-500 font-mono">Logged at ${inc.timestamp}</div>
            </div>
          `)
        )
        .addTo(map);

      incidentMarkersRef.current.push(marker);
    });
  }, [incidents]);

  const fitRouteBounds = (map: maplibregl.Map, rList: RouteData[]) => {
    if (!rList.length) return;
    const bounds = new maplibregl.LngLatBounds();
    rList.forEach((r) => {
      r.geometry.coordinates.forEach((coord) => {
        bounds.extend(coord);
      });
    });
    map.fitBounds(bounds, {
      padding: { top: 60, bottom: 60, left: 450, right: 60 },
      maxZoom: 14,
      duration: 1200,
    });
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        ref={mapContainer}
        className="w-full h-full relative"
        style={{
          backgroundColor: '#090d16',
          backgroundImage: 'radial-gradient(rgba(51, 65, 85, 0.45) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />
      {isOfflineMode && (
        <div className="absolute bottom-6 left-6 z-20 bg-slate-900/90 border border-cyan-500/40 px-3 py-1.5 rounded-xl shadow-xl backdrop-blur-md flex items-center gap-2 text-xs text-cyan-300 animate-in fade-in duration-300">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>Offline Vector Canvas Active (Tile Server Offline — Routes & Safety Markers Visible)</span>
        </div>
      )}
    </div>
  );
};
