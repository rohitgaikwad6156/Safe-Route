import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { RouteData, IncidentReport } from '../types';
import { AmenityFilters } from './LayerControls';
import type { BottomSheetState } from './MobileBottomSheet';
import type { LiveCoordinates } from '../lib/geolocation';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
}

const LIVE_ACCURACY_SOURCE_ID = 'live-location-accuracy-source';
const LIVE_ACCURACY_LAYER_ID = 'live-location-accuracy-layer';
const EARTH_RADIUS_METERS = 6_371_000;

function buildAccuracyCircle(location: LiveCoordinates) {
  if (!Number.isFinite(location.accuracy) || location.accuracy <= 0) {
    return { type: 'FeatureCollection' as const, features: [] };
  }

  const latitudeRadians = location.latitude * Math.PI / 180;
  const angularRadius = location.accuracy / EARTH_RADIUS_METERS;
  const coordinates: [number, number][] = [];
  for (let index = 0; index <= 48; index += 1) {
    const angle = index / 48 * Math.PI * 2;
    const latitude = location.latitude + angularRadius * Math.cos(angle) * 180 / Math.PI;
    const longitude = location.longitude
      + angularRadius * Math.sin(angle) * 180 / Math.PI / Math.max(0.01, Math.cos(latitudeRadians));
    coordinates.push([longitude, latitude]);
  }

  return {
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      properties: { accuracy: location.accuracy },
      geometry: { type: 'Polygon' as const, coordinates: [coordinates] },
    }],
  };
}

const EMPTY_ACCURACY_DATA = { type: 'FeatureCollection' as const, features: [] };

interface MapProps {
  routes: RouteData[];
  selectedRouteId: string;
  onSelectRoute: (routeId: string) => void;
  showHeatmap: boolean;
  amenityFilters: AmenityFilters;
  showCommunity: boolean;
  incidents: IncidentReport[];
  isPinningMode: boolean;
  onMapClickPin?: (coords: { lat: number; lon: number }) => void;
  originCoords?: [number, number];
  destCoords?: [number, number];
  originName?: string;
  destName?: string;
  mobileSheetState?: BottomSheetState;
  navigationMode?: boolean;
  currentPosition?: LiveCoordinates | null;
}

export const Map: React.FC<MapProps> = ({
  routes,
  selectedRouteId,
  onSelectRoute,
  showHeatmap,
  amenityFilters,
  showCommunity,
  incidents,
  isPinningMode,
  onMapClickPin,
  originCoords = [73.8446, 18.5314],
  destCoords = [73.8553, 18.4529],
  originName = 'Shivajinagar Station',
  destName = 'Katraj Chowk',
  mobileSheetState = 'collapsed',
  navigationMode = false,
  currentPosition = null,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  const originMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);
  const currentPositionMarkerRef = useRef<maplibregl.Marker | null>(null);
  const incidentMarkersRef = useRef<maplibregl.Marker[]>([]);
  const amenityMarkersRef = useRef<maplibregl.Marker[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const activeRouteLayerIdsRef = useRef<string[]>([]);

  const [mapReady, setMapReady] = useState(false);
  const [mapData, setMapData] = useState<any>(null);
  const live = useRef({ isPinningMode, onMapClickPin, onSelectRoute });
  live.current = { isPinningMode, onMapClickPin, onSelectRoute };
  const keyAmenities: {name: string; lat: number; lon: number; type: string}[] = mapData ? Object.values(mapData.amenities).flat() as any : [];
  useEffect(() => {
    const base = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '' : 'http://127.0.0.1:8000')).replace(/\/$/, '');
    const refresh = () => fetch(`${base}/api/map-data`).then(r => { if (!r.ok) throw new Error('Map data unavailable'); return r.json(); }).then(setMapData).catch(() => {});
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const map = mapInstance.current;
    if (mapReady && mapData && map) (map.getSource('risk-heatmap-src') as maplibregl.GeoJSONSource | undefined)?.setData(mapData.heatmap);
  }, [mapData, mapReady]);

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
    const cleanName = escapeHtml((name || 'Origin').split(',')[0].trim());
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
    const cleanName = escapeHtml((name || 'Destination').split(',')[0].trim());
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
      .setPopup(new maplibregl.Popup({ offset: 25 }).setText(`Start: ${originName}`))
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
      .setPopup(new maplibregl.Popup({ offset: 25 }).setText(`End: ${destName}`))
      .addTo(map);
  };

  const setupMapContent = (map: maplibregl.Map) => {
    if (map.getSource('risk-heatmap-src')) return;

    // 1. Add Risk Heatmap Source & Layer (Calibrated opacity so streets remain readable)
    map.addSource('risk-heatmap-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
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

    map.addSource(LIVE_ACCURACY_SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_ACCURACY_DATA,
    });
    map.addLayer({
      id: LIVE_ACCURACY_LAYER_ID,
      type: 'fill',
      source: LIVE_ACCURACY_SOURCE_ID,
      paint: {
        'fill-color': '#2563eb',
        'fill-opacity': 0.12,
        'fill-outline-color': '#60a5fa',
      },
    });

    // Initial route sync and markers
    syncRoutesOnMap(map, routes, selectedRouteId);
    syncMarkers(map);
  };

  const syncRoutesOnMap = (map: maplibregl.Map, routeList: RouteData[], currentSelId: string) => {
    if (!map.getStyle()) return;

    const currentLayerIds = new Set<string>();
    // Remove geometries from the previous request, including when the new request fails.
    const retainedLayers = new Set(routeList.flatMap(r => [`route-casing-${r.id}`, `route-line-${r.id}`]));
    for (const id of activeRouteLayerIdsRef.current) {
      if (!retainedLayers.has(id) && map.getLayer(id)) map.removeLayer(id);
    }
    for (const id of Object.keys(map.getStyle().sources)) {
      if (id.startsWith('route-source-') && !routeList.some(r => id === `route-source-${r.id}`) && map.getSource(id)) map.removeSource(id);
    }

    // 1. Ensure all sources and layers exist
    routeList.forEach((route) => {
      const sourceId = `route-source-${route.id}`;
      const casingId = `route-casing-${route.id}`;
      const lineId = `route-line-${route.id}`;
      currentLayerIds.add(casingId);
      currentLayerIds.add(lineId);

      const isSelected = route.id === currentSelId;
      const isVisible = !navigationMode || isSelected;
      const isSafest = route.type === 'safest';
      const isBalanced = route.type === 'balanced';
      const isFastest = route.type === 'fastest';

      const baseWidth = isSafest ? 5.5 : isBalanced ? 5.0 : 4.5;
      const selWidth = navigationMode ? 9.5 : isSafest ? 8.0 : isBalanced ? 7.0 : 6.5;
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
            visibility: isVisible ? 'visible' : 'none',
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
            visibility: isVisible ? 'visible' : 'none',
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
          if (!live.current.isPinningMode) live.current.onSelectRoute(route.id);
        });
      }

      // Update line styles
      if (map.getLayer(casingId)) {
        map.setLayoutProperty(casingId, 'visibility', isVisible ? 'visible' : 'none');
        map.setPaintProperty(casingId, 'line-color', '#ffffff');
        map.setPaintProperty(casingId, 'line-width', casingWidth);
        map.setPaintProperty(casingId, 'line-opacity', isSelected ? 1.0 : 0.70);
      }
      if (map.getLayer(lineId)) {
        map.setLayoutProperty(lineId, 'visibility', isVisible ? 'visible' : 'none');
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
      const mobileBottomPadding = mobileSheetState === 'collapsed'
        ? 155
        : mobileSheetState === 'half'
          ? Math.min(window.innerHeight * 0.58, 560)
          : 90;
      map.fitBounds(bounds, {
        padding: { top: 75, bottom: isMobile ? mobileBottomPadding : 65, left: isMobile ? 30 : 470, right: 60 },
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
      setMapReady(true);
    });

    map.on('error', (e) => {
      const errStr = e.error?.message || '';
      if (errStr.includes('style') || errStr.includes('fetch') || errStr.includes('Failed') || errStr.includes('tile')) {
        setIsOfflineMode(true);
      }
    });

    map.on('click', (e) => {
      if (live.current.isPinningMode && live.current.onMapClickPin) {
        live.current.onMapClickPin({ lat: e.lngLat.lat, lon: e.lngLat.lng });
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
      if (currentPositionMarkerRef.current) {
        currentPositionMarkerRef.current.remove();
        currentPositionMarkerRef.current = null;
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
    try {
      syncRoutesOnMap(map, routes, selectedRouteId);
    } catch (error) {
      console.error('Map route-layer update failed without interrupting navigation.', error);
    }
  }, [routes, selectedRouteId, mapReady, mobileSheetState, navigationMode]);

  // MapLibre keeps the same WebGL map throughout navigation. Resize its canvas
  // when the viewport, browser chrome, or bottom-sheet state changes instead of
  // remounting the map (which can produce a blank/black canvas on mobile GPUs).
  useEffect(() => {
    const map = mapInstance.current;
    const container = mapContainer.current;
    if (!map || !container || !mapReady) return;

    let animationFrame: number | null = null;
    const resizeMap = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        try {
          if (mapInstance.current === map && container.isConnected) map.resize();
        } catch (error) {
          console.warn('Map resize was skipped because the canvas was unavailable.', error);
        }
        animationFrame = null;
      });
    };
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resizeMap);
    resizeObserver?.observe(container);
    window.addEventListener('orientationchange', resizeMap);
    resizeMap();

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('orientationchange', resizeMap);
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    };
  }, [mapReady]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapReady) return;
    const animationFrame = requestAnimationFrame(() => {
      try {
        if (mapInstance.current === map && mapContainer.current?.isConnected) map.resize();
      } catch (error) {
        console.warn('Navigation map resize was skipped.', error);
      }
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [navigationMode, mobileSheetState, mapReady]);

  // Update Heatmap visibility
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getLayer('risk-heatmap-layer')) {
      map.setLayoutProperty('risk-heatmap-layer', 'visibility', showHeatmap && !navigationMode ? 'visible' : 'none');
    }
  }, [showHeatmap, navigationMode, mapReady]);

  // Reactive marker synchronization whenever coordinates, names, or routes change
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;
    syncMarkers(map);
  }, [originCoords, destCoords, originName, destName, routes, selectedRouteId]);

  useEffect(() => {
    const map = mapInstance.current;
    const accuracySource = map?.getSource(LIVE_ACCURACY_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!map || !navigationMode || !currentPosition) {
      currentPositionMarkerRef.current?.remove();
      currentPositionMarkerRef.current = null;
      accuracySource?.setData(EMPTY_ACCURACY_DATA);
      return;
    }

    if (!currentPositionMarkerRef.current) {
      const element = document.createElement('div');
      element.className = 'navigation-position-marker';
      element.innerHTML = `
        <div class="relative flex h-11 w-11 items-center justify-center" aria-label="Current position">
          <span data-heading-indicator class="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[6px] border-b-[13px] border-x-transparent border-b-blue-700 drop-shadow"></span>
          <span class="absolute h-9 w-9 animate-ping rounded-full bg-blue-500/25"></span>
          <span class="relative h-5 w-5 rounded-full border-[3px] border-white bg-blue-600 shadow-lg"></span>
        </div>
      `;
      currentPositionMarkerRef.current = new maplibregl.Marker({
        element,
        anchor: 'center',
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        // MapLibre requires coordinates before addTo(); otherwise its first
        // marker update dereferences an undefined internal LngLat.
        .setLngLat([currentPosition.longitude, currentPosition.latitude])
        .setPopup(new maplibregl.Popup({ offset: 16 }).setText('Your current position'))
        .addTo(map);
    }

    const marker = currentPositionMarkerRef.current;
    const headingIndicator = marker.getElement().querySelector<HTMLElement>('[data-heading-indicator]');
    const hasHeading = currentPosition.heading !== null && Number.isFinite(currentPosition.heading);
    if (headingIndicator) headingIndicator.style.display = hasHeading ? 'block' : 'none';
    try {
      marker
        .setLngLat([currentPosition.longitude, currentPosition.latitude])
        .setRotation(hasHeading ? currentPosition.heading! : 0);
      accuracySource?.setData(buildAccuracyCircle(currentPosition));
    } catch (error) {
      console.error('Live location marker update failed without stopping navigation.', error);
    }
  }, [currentPosition, navigationMode, mapReady]);

  // Update Safety Amenities Markers
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    amenityMarkersRef.current.forEach((m) => m.remove());
    amenityMarkersRef.current = [];

    const visibleTypes: Record<string, boolean> = {
      hospital: amenityFilters.hospitals, clinic: amenityFilters.hospitals, police: amenityFilters.police,
      fire_station: amenityFilters.fire, street_lamp: amenityFilters.streetlights, crossing: amenityFilters.crossings,
      traffic_signals: amenityFilters.signals, ecb: amenityFilters.safe_places,
      emergency_access_point: amenityFilters.safe_places, defibrillator: amenityFilters.safe_places, ambulance_station: amenityFilters.safe_places,
    };
    const visibleAmenities = navigationMode ? [] : keyAmenities.filter(item => visibleTypes[item.type]).slice(0, 350);
    if (visibleAmenities.length) {
      visibleAmenities.forEach((item) => {
        const el = document.createElement('div');
        const isHosp = item.type === 'hospital' || item.type === 'clinic';
        el.className = 'amenity-marker';
        el.innerHTML = `
          <div class="px-2.5 py-1 rounded-full text-[11px] font-bold border shadow-md flex items-center gap-1.5 bg-white/95 backdrop-blur-md ${
            isHosp
              ? 'text-rose-700 border-rose-200'
              : 'text-blue-700 border-blue-200'
          }">
            <span>${isHosp ? '🏥' : item.type === 'police' ? '🚓' : item.type === 'fire_station' ? '🚒' : item.type === 'ambulance_station' ? '🚑' : item.type === 'defibrillator' ? '❤️' : item.type === 'ecb' || item.type === 'emergency_access_point' ? '☎' : item.type === 'street_lamp' ? '💡' : item.type === 'crossing' ? '🚶' : '🚦'}</span>
          </div>
        `;
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([item.lon, item.lat])
          .setPopup(new maplibregl.Popup({ offset: 12 }).setText(`${item.name} — ${item.type.replace(/_/g, ' ')} (mapped facility; availability unconfirmed)`))
          .addTo(map);
        el.title = item.name;
        amenityMarkersRef.current.push(marker);
      });
    }
  }, [amenityFilters, mapData, mapReady, navigationMode]);

  // Update Incident markers
  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    incidentMarkersRef.current.forEach((m) => m.remove());
    incidentMarkersRef.current = [];

    if (!showCommunity || navigationMode) return;
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
          new maplibregl.Popup({ offset: 12 }).setText(`${inc.category.replace(/_/g, ' ')} (severity ${inc.severity}/5). ${inc.description}`)
        )
        .addTo(map);

      incidentMarkersRef.current.push(marker);
    });
  }, [incidents, showCommunity, mapReady, navigationMode]);

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
      {!navigationMode && routes && routes.length > 1 && (
        <div className="absolute top-4 left-4 md:left-[450px] z-20 hidden md:flex items-center gap-1.5 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl border border-slate-200/90 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
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
        <div className="absolute bottom-[calc(9rem+env(safe-area-inset-bottom))] left-3 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-xl border border-amber-300 bg-white/95 px-3 py-2 text-sm text-slate-800 shadow-xl backdrop-blur-md md:bottom-6 md:left-6">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span>Offline Vector Canvas Active (Tile Server Offline — Routes & Safety Markers Visible)</span>
        </div>
      )}
    </div>
  );
};
