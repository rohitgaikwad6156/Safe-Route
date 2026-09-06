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
  const activeRouteLayerIdsRef = useRef<string[]>([]);

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

  const buildOriginHtml = (name: string) => {
    const cleanName = (name || 'Origin').split(',')[0].trim();
    return `
      <div class="relative flex flex-col items-center group cursor-pointer select-none" style="z-index: 50;">
        <div class="mb-1.5 px-3 py-1 rounded-full bg-white border-2 border-emerald-600 shadow-xl flex items-center gap-1.5 text-xs font-bold text-slate-800 pointer-events-none whitespace-nowrap">
          <span class="bg-emerald-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded tracking-wider uppercase shadow-sm">Start</span>
          <span class="text-slate-800 font-semibold">${cleanName}</span>
        </div>
        <div class="relative flex items-center justify-center transition-transform duration-200 group-hover:scale-110 drop-shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="34" height="44">
            <defs>
              <linearGradient id="src-pin-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#10b981" />
                <stop offset="100%" stop-color="#059669" />
              </linearGradient>
            </defs>
            <path d="M16 2 C8.27 2 2 8.27 2 16 C2 24.5 13 38.5 15.1 41.1 C15.55 41.65 16.45 41.65 16.9 41.1 C19 38.5 30 24.5 30 16 C30 8.27 23.73 2 16 2 Z" fill="url(#src-pin-grad)" stroke="#ffffff" stroke-width="2" />
            <circle cx="16" cy="16" r="8" fill="#ffffff" stroke="#059669" stroke-width="1.5" />
            <circle cx="16" cy="16" r="4.5" fill="#059669" />
          </svg>
        </div>
        <div class="w-3 h-1.5 rounded-full bg-emerald-500/80 blur-[0.5px] animate-ping -mt-0.5"></div>
      </div>
    `;
  };

  const buildDestHtml = (name: string) => {
    const cleanName = (name || 'Destination').split(',')[0].trim();
    return `
      <div class="relative flex flex-col items-center group cursor-pointer select-none" style="z-index: 50;">
        <div class="mb-1.5 px-3 py-1 rounded-full bg-white border-2 border-rose-600 shadow-xl flex items-center gap-1.5 text-xs font-bold text-slate-800 pointer-events-none whitespace-nowrap">
          <span class="bg-rose-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded tracking-wider uppercase shadow-sm">End</span>
          <span class="text-slate-800 font-semibold">${cleanName}</span>
        </div>
        <div class="relative flex items-center justify-center transition-transform duration-200 group-hover:scale-110 drop-shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="34" height="44">
            <defs>
              <linearGradient id="dest-pin-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#f43f5e" />
                <stop offset="100%" stop-color="#e11d48" />
              </linearGradient>
            </defs>
            <path d="M16 2 C8.27 2 2 8.27 2 16 C2 24.5 13 38.5 15.1 41.1 C15.55 41.65 16.45 41.65 16.9 41.1 C19 38.5 30 24.5 30 16 C30 8.27 23.73 2 16 2 Z" fill="url(#dest-pin-grad)" stroke="#ffffff" stroke-width="2" />
            <circle cx="16" cy="16" r="8" fill="#ffffff" stroke="#e11d48" stroke-width="1.5" />
            <path d="M13 12 L19 12 L16.5 14.5 L19 17 L13 17 Z" fill="#e11d48" />
            <line x1="13" y1="12" x2="13" y2="20" stroke="#e11d48" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </div>
        <div class="w-3 h-1.5 rounded-full bg-rose-500/80 blur-[0.5px] animate-ping -mt-0.5"></div>
      </div>
    `;
  };

  const syncMarkers = (map: maplibregl.Map) => {
    if (!map) return;

    let sLng = originCoords[0];
    let sLat = originCoords[1];
    let dLng = destCoords[0];
    let dLat = destCoords[1];

    if (routes && routes.length > 0) {
      const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];
      const coords = activeRoute?.geometry?.coordinates;
      if (coords && coords.length >= 2) {
        sLng = coords[0][0];
        sLat = coords[0][1];
        dLng = coords[coords.length - 1][0];
        dLat = coords[coords.length - 1][1];
      }
    }

    if (originMarkerRef.current) {
      originMarkerRef.current.remove();
      originMarkerRef.current = null;
    }
    const oEl = document.createElement('div');
    oEl.className = 'origin-marker cursor-pointer select-none';
    oEl.innerHTML = buildOriginHtml(originName);
    originMarkerRef.current = new maplibregl.Marker({ element: oEl, anchor: 'bottom' })
      .setLngLat([sLng, sLat])
      .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`<div class="font-bold text-xs text-emerald-700">🟢 Start: ${originName}</div>`))
      .addTo(map);

    if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }
    const dEl = document.createElement('div');
    dEl.className = 'dest-marker cursor-pointer select-none';
    dEl.innerHTML = buildDestHtml(destName);
    destMarkerRef.current = new maplibregl.Marker({ element: dEl, anchor: 'bottom' })
      .setLngLat([dLng, dLat])
      .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`<div class="font-bold text-xs text-rose-700">🔴 End: ${destName}</div>`))
      .addTo(map);
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
        'heatmap-opacity': 0.65,
      },
      layout: {
        visibility: showHeatmap ? 'visible' : 'none',
      },
    });

    // Initial route sync and markers
    syncRoutesOnMap(map, routes, selectedRouteId);
    syncMarkers(map);
  };

  const syncRoutesOnMap = (map: maplibregl.Map, routeList: RouteData[], currentSelId: string) => {
    if (!map.getStyle()) return;

    const currentLayerIds = new Set<string>();

    // 1. Ensure all sources and layers exist
    routeList.forEach((route) => {
      const sourceId = `route-source-${route.id}`;
      const casingId = `route-casing-${route.id}`;
      const lineId = `route-line-${route.id}`;
      currentLayerIds.add(casingId);
      currentLayerIds.add(lineId);

      const isSelected = route.id === currentSelId;
      const isSafest = route.type === 'safest';
      const isBalanced = route.type === 'balanced';
      const isFastest = route.type === 'fastest';

      const baseWidth = isSafest ? 5.5 : isBalanced ? 5.0 : 4.5;
      const selWidth = isSafest ? 8.0 : isBalanced ? 7.0 : 6.5;
      const currentWidth = isSelected ? selWidth : baseWidth;
      const casingWidth = currentWidth + (isSelected ? 5.0 : 2.5);

      const geoData: any = {
        type: 'Feature',
        properties: {
          id: route.id,
          name: route.name,
          color: route.color,
          rss: route.rss,
        },
        geometry: route.geometry,
      };

      const existingSource = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
      if (existingSource) {
        existingSource.setData(geoData);
      } else {
        map.addSource(sourceId, {
          type: 'geojson',
          data: geoData,
        });

        // Casing Halo (rendered underneath lines for crisp contrast on light streets)
        map.addLayer({
          id: casingId,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#ffffff',
            'line-width': casingWidth,
            'line-opacity': isSelected ? 1.0 : 0.70,
          },
        });

        // Primary polyline: Safest (Emerald #059669), Fastest (Google Blue #1a73e8), Balanced (Amber #d97706)
        const primaryColor =
          isSafest ? '#059669' : isFastest ? '#1a73e8' : isBalanced ? '#d97706' : route.color;

        const linePaint: Record<string, any> = {
          'line-color': primaryColor,
          'line-width': currentWidth,
          'line-opacity': isSelected ? 1.0 : 0.85,
        };

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

        // Click handlers
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
      }

      // Update line styles
      if (map.getLayer(casingId)) {
        map.setPaintProperty(casingId, 'line-color', '#ffffff');
        map.setPaintProperty(casingId, 'line-width', casingWidth);
        map.setPaintProperty(casingId, 'line-opacity', isSelected ? 1.0 : 0.70);
      }
      if (map.getLayer(lineId)) {
        const primaryColor =
          isSafest ? '#059669' : isFastest ? '#1a73e8' : isBalanced ? '#d97706' : route.color;
        map.setPaintProperty(lineId, 'line-color', primaryColor);
        map.setPaintProperty(lineId, 'line-width', currentWidth);
        map.setPaintProperty(lineId, 'line-opacity', isSelected ? 1.0 : 0.75);
      }
    });

    // 2. Controlled layer z-stacking:
    // ALL casings go to the bottom of the route stack so NO casing ever covers ANY colored line.
    routeList.forEach((r) => {
      const cId = `route-casing-${r.id}`;
      if (map.getLayer(cId)) map.moveLayer(cId);
    });

    // Unselected lines go next
    routeList.forEach((r) => {
      if (r.id !== currentSelId) {
        const lId = `route-line-${r.id}`;
        if (map.getLayer(lId)) map.moveLayer(lId);
      }
    });

    // Selected route line goes on the very top of all route lines
    const selLineId = `route-line-${currentSelId}`;
    if (map.getLayer(selLineId)) map.moveLayer(selLineId);

    activeRouteLayerIdsRef.current = Array.from(currentLayerIds);

    // Fit bounds to cover all newly synced routes
    fitRouteBounds(map, routeList);

    // Sync Start and End markers at route endpoints
    syncMarkers(map);
  };

  const fitRouteBounds = (map: maplibregl.Map, rList: RouteData[]) => {
    if (!rList || rList.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    let hasCoords = false;

    // Extend bounds with origin pin coordinate
    if (originCoords && Array.isArray(originCoords) && originCoords.length >= 2) {
      bounds.extend(originCoords);
      hasCoords = true;
    }
    // Extend bounds with destination pin coordinate
    if (destCoords && Array.isArray(destCoords) && destCoords.length >= 2) {
      bounds.extend(destCoords);
      hasCoords = true;
    }

    rList.forEach((r) => {
      r.geometry?.coordinates?.forEach((coord) => {
        if (Array.isArray(coord) && coord.length >= 2) {
          bounds.extend([coord[0], coord[1]]);
          hasCoords = true;
        }
      });
    });

    if (hasCoords && !bounds.isEmpty()) {
      const isMobile = window.innerWidth < 768;
      map.fitBounds(bounds, {
        padding: { top: 75, bottom: 65, left: isMobile ? 30 : 470, right: 60 },
        maxZoom: 14,
        duration: 800,
      });
    }
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return;

    const puneCenter: [number, number] = [73.848, 18.492];

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
      center: puneCenter,
      zoom: 12.2,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      setupMapContent(map);
    });

    map.on('error', (e) => {
      const errStr = e.error?.message || '';
      if (errStr.includes('style') || errStr.includes('fetch') || errStr.includes('Failed') || errStr.includes('tile')) {
        setIsOfflineMode(true);
      }
    });

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
      if (originMarkerRef.current) {
        originMarkerRef.current.remove();
        originMarkerRef.current = null;
      }
      if (destMarkerRef.current) {
        destMarkerRef.current.remove();
        destMarkerRef.current = null;
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

  // Reactive Route Synchronization whenever routes or selection change
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.isStyleLoaded()) return;
    syncRoutesOnMap(map, routes, selectedRouteId);
  }, [routes, selectedRouteId]);

  // Update Heatmap visibility
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getLayer('risk-heatmap-layer')) {
      map.setLayoutProperty('risk-heatmap-layer', 'visibility', showHeatmap ? 'visible' : 'none');
    }
  }, [showHeatmap]);

  // Reactive marker synchronization whenever coordinates, names, or routes change
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    syncMarkers(map);
  }, [originCoords, destCoords, originName, destName, routes, selectedRouteId]);

  // Update Safety Amenities Markers
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    amenityMarkersRef.current.forEach((m) => m.remove());
    amenityMarkersRef.current = [];

    if (showAmenities) {
      keyAmenities.forEach((item) => {
        const el = document.createElement('div');
        const isHosp = item.type === 'hospital';
        el.className = 'amenity-marker';
        el.innerHTML = `
          <div class="px-2.5 py-1 rounded-full text-[11px] font-bold border shadow-md flex items-center gap-1.5 bg-white/95 backdrop-blur-md ${
            isHosp
              ? 'text-rose-700 border-rose-200'
              : 'text-blue-700 border-blue-200'
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
          <span class="animate-ping absolute inline-flex h-6 w-6 rounded-full bg-rose-400 opacity-60"></span>
          <div class="relative w-6 h-6 rounded-full bg-rose-500 border-2 border-white shadow-lg flex items-center justify-center text-white font-extrabold text-[11px]">
            ⚠️
          </div>
        </div>
      `;
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([inc.lon, inc.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 12 }).setHTML(`
            <div class="space-y-1 p-0.5">
              <div class="text-xs font-bold text-rose-600 uppercase tracking-wide">Reported Hazard</div>
              <div class="text-xs font-bold text-slate-800">${inc.category.replace('_', ' ')} (Sev: ${inc.severity}/5)</div>
              <div class="text-[11px] text-slate-600">${inc.description}</div>
              <div class="text-[10px] text-slate-400 font-mono">Logged at ${inc.timestamp}</div>
            </div>
          `)
        )
        .addTo(map);

      incidentMarkersRef.current.push(marker);
    });
  }, [incidents]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div
        ref={mapContainer}
        className="w-full h-full relative"
        style={{
          backgroundColor: '#f8fafc',
        }}
      />
      {/* Floating Interactive Route Selector Pill Bar on Map */}
      {routes && routes.length > 1 && (
        <div className="absolute top-4 left-4 md:left-[450px] z-20 flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200/90 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="text-[11px] uppercase font-bold text-slate-500 px-2 tracking-wider flex items-center gap-1 border-r border-slate-200 mr-0.5">
            <span>Routes</span>
            <span className="text-emerald-600 font-mono">({routes.length})</span>
          </div>
          {routes.map((r) => {
            const isSel = r.id === selectedRouteId;
            const rColor =
              r.type === 'safest' ? '#059669' : r.type === 'fastest' ? '#1a73e8' : '#d97706';
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelectRoute(r.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                  isSel
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: rColor }}
                />
                <span className="capitalize">{r.type}</span>
                <span
                  className={`text-[11px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                    isSel ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {Math.round(r.rss)} RSS
                </span>
              </button>
            );
          })}
        </div>
      )}

      {isOfflineMode && (
        <div className="absolute bottom-6 left-6 z-20 bg-white/95 border border-amber-300 px-3 py-1.5 rounded-xl shadow-xl backdrop-blur-md flex items-center gap-2 text-xs text-slate-800 animate-in fade-in duration-300">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span>Offline Vector Canvas Active (Tile Server Offline — Routes & Safety Markers Visible)</span>
        </div>
      )}
    </div>
  );
};
