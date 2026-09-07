import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Shield, Navigation, AlertTriangle, Sparkles, Layers, Sliders, MapPin, Compass, CheckCircle2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { RoutePlanner } from './components/RoutePlanner';
import { DeparturePicker } from './components/DeparturePicker';
import { RadialGauge } from './components/RadialGauge';
import { RouteCards } from './components/RouteCards';
import { LayerControls } from './components/LayerControls';
import { IncidentModal } from './components/IncidentModal';
import { Map } from './components/Map';
import { RouteData, IncidentReport, Landmark } from './types';

import { adjustRouteRSS, computeTemporalModifier } from './lib/temporal';
import { geocodeLocation, GeocodeResult } from './lib/geocoding';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export function App() {
  const [origin, setOrigin] = useState('Shivajinagar Station, Pune');
  const [destination, setDestination] = useState('Katraj (Katraj Chowk), Pune');
  const [originCoords, setOriginCoords] = useState<[number, number]>([73.8446, 18.5314]);
  const [destCoords, setDestCoords] = useState<[number, number]>([73.8553, 18.4529]);
  
  const [departureTime, setDepartureTime] = useState('21:30');
  const [departureDate, setDepartureDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  const day = new Date(`${departureDate}T12:00:00+05:30`).getUTCDay();
  const isWeekend = day === 0 || day === 6 || (day === 5 && Number(departureTime.split(':')[0]) >= 20);
  const requestSequence = React.useRef(0);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('route-safest');
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);

  // Dynamic raw routes loaded from live backend or pre-calibrated benchmark
  const [rawRoutes, setRawRoutes] = useState<RouteData[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const [routeNotice, setRouteNotice] = useState<string | null>(null);

  // Map layer states
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [showAmenities, setShowAmenities] = useState<boolean>(true);

  // Incident reporting state with localStorage persistence
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
  const [isPinningMode, setIsPinningMode] = useState(false);
  const [pinnedLocation, setPinnedLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  // Backend Health check
  const [backendHealth, setBackendHealth] = useState<{ status: string; loadTime?: number; nodes?: number } | null>(null);

  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(2500) });
        if (res.ok && active) {
          const data = await res.json();
          setBackendHealth({ status: data.status, loadTime: data.load_time_seconds, nodes: data.total_nodes });
        }
      } catch (e) {
        if (active) {
          setBackendHealth({ status: 'offline' });
        }
      }
    };
    checkHealth();
    const timer = setInterval(checkHealth, 6000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // Universal Route Calculator supporting ANY Pune origin & destination
  const calculateCorridorRoutes = useCallback(
    async (origText: string, destText: string) => {
      if (!origText.trim() || !destText.trim()) return;

      const sequence = ++requestSequence.current;
      setRawRoutes([]);
      setIsLoadingRoutes(true);
      setRouteNotice(null);

      try {
        // 1. Geocode origin and destination concurrently
        const [origGeo, destGeo] = await Promise.all([
          geocodeLocation(origText, API_BASE_URL),
          geocodeLocation(destText, API_BASE_URL),
        ]);

        if (sequence !== requestSequence.current) return;

        // Guard: if geocoding failed to resolve either location, surface a clear error
        // instead of silently using (0,0) or stale previous coordinates.
        if (!origGeo.found) {
          setRouteNotice(`⚠️ Could not locate "${origText}" in Pune. Try a more specific address or a nearby landmark.`);
          setIsLoadingRoutes(false);
          return;
        }
        if (!destGeo.found) {
          setRouteNotice(`⚠️ Could not locate "${destText}" in Pune. Try a more specific address or a nearby landmark.`);
          setIsLoadingRoutes(false);
          return;
        }

        // Use the resolved canonical name from geocoder (landmark name or Nominatim display name),
        // but keep the user's typed text as the label if the geocoder returned the raw input back.
        const origDisplayName = origGeo.name || origText;
        const destDisplayName = destGeo.name || destText;

        const newOrigCoords: [number, number] = [origGeo.lon, origGeo.lat];
        const newDestCoords: [number, number] = [destGeo.lon, destGeo.lat];

        setOrigin(origDisplayName);
        setDestination(destDisplayName);
        setOriginCoords(newOrigCoords);
        setDestCoords(newDestCoords);

        // 3. Query live backend multi-objective routing engine
        let backendSuccess = false;
        let backendMessage = 'Road routing is unavailable. Retry when the backend is ready; no safety route has been calculated.';
        try {
          const res = await fetch(`${API_BASE_URL}/api/routes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              origin: { lat: origGeo.lat, lon: origGeo.lon, name: origDisplayName },
              destination: { lat: destGeo.lat, lon: destGeo.lon, name: destDisplayName },
              departure_time: departureTime,
              departure_date: departureDate
            }),
            signal: AbortSignal.timeout(60000),
          });

          if (!res.ok) { const error = await res.json(); backendMessage = error.message || backendMessage; }
          if (res.ok) {
            const data = await res.json();
            if (sequence !== requestSequence.current) return;
            if (data && Array.isArray(data.routes) && data.routes.length > 0) {
              const styledRoutes = data.routes.map((r: RouteData) => ({
                ...r,
                color: r.type === 'safest' ? '#059669' : r.type === 'balanced' ? '#d97706' : '#1a73e8'
              }));
              setRawRoutes(styledRoutes);
              const safest = styledRoutes.find((r: RouteData) => r.type === 'safest');
              setSelectedRouteId(safest ? safest.id : styledRoutes[0].id);
              const srcLabel = `${origGeo.source === 'nominatim_online' ? '🌐' : origGeo.source === 'backend_geocoder' ? '🔍' : '📍'} ${origDisplayName.split(',')[0]}`;
              const dstLabel = `${destGeo.source === 'nominatim_online' ? '🌐' : destGeo.source === 'backend_geocoder' ? '🔍' : '📍'} ${destDisplayName.split(',')[0]}`;
              setRouteNotice(`Road routes calculated: ${srcLabel} → ${dstLabel}. Scores are research estimates; traffic is simulated. Access to the snapped road: ${data.snap_distances_meters?.origin || 0} m at origin, ${data.snap_distances_meters?.destination || 0} m at destination.`);
              backendSuccess = true;

              // Snap marker coordinates to the exact road-network endpoints of the polyline
              const primaryRoute = safest || styledRoutes[0];
              if (primaryRoute && primaryRoute.geometry?.coordinates?.length >= 2) {
                const firstCoord = primaryRoute.geometry.coordinates[0];
                const lastCoord = primaryRoute.geometry.coordinates[primaryRoute.geometry.coordinates.length - 1];
                setOriginCoords([firstCoord[0], firstCoord[1]]);
                setDestCoords([lastCoord[0], lastCoord[1]]);
              }
            }
          }
        } catch (backendErr) {
          console.warn('Backend route computation unavailable, using fallback:', backendErr);
        }

        if (!backendSuccess && sequence === requestSequence.current) {
          setRawRoutes([]);
          setRouteNotice(backendMessage);
        }
      } catch (err: any) {
        if (sequence !== requestSequence.current) return;
        console.error('Route calculation error:', err);
        setRouteNotice('⚠️ Route calculation failed. Please check your connection and try again.');
      } finally {
        if (sequence === requestSequence.current) setIsLoadingRoutes(false);
      }
    },
    [departureTime, departureDate]
  );

  useEffect(() => {
    if (backendHealth?.status === 'ready') calculateCorridorRoutes(origin, destination);
  }, [backendHealth?.status, departureTime, departureDate]);

  const routes = rawRoutes;

  const refreshIncidents = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/api/incidents`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Could not load community reports.');
    const data = await response.json();
    setIncidents(data.cells.map((cell: any) => ({
      id: cell.cell_id, category: cell.incident_types[0], severity: cell.max_severity,
      description: `${cell.incident_count} report(s), ${cell.status.replaceAll('_', ' ')}. Decayed hazard: ${cell.hazard_score}. Approximate 250 m cell.`,
      lat: cell.center_lat, lon: cell.center_lon, timestamp: 'Active (expires after 12 hours)',
    })));
    return data;
  }, []);

  useEffect(() => {
    refreshIncidents().catch(() => {});
    const timer = setInterval(() => {
      refreshIncidents().catch(() => {});
      if (backendHealth?.status === 'ready') calculateCorridorRoutes(origin, destination);
    }, 60000);
    return () => clearInterval(timer);
  }, [refreshIncidents, backendHealth?.status, calculateCorridorRoutes, origin, destination]);

  const selectedRoute = useMemo(() => {
    return routes.find((r) => r.id === selectedRouteId) || routes[0];
  }, [routes, selectedRouteId]);

  const temporalMod = useMemo(() => {
    return computeTemporalModifier(departureTime, isWeekend);
  }, [departureTime, isWeekend]);

  const handleSwapLocations = () => {
    const tempName = origin;
    const tempCoords = originCoords;
    setOrigin(destination);
    setDestination(tempName);
    setOriginCoords(destCoords);
    setDestCoords(tempCoords);

    calculateCorridorRoutes(destination, origin);
  };

  const handleSelectLandmark = (landmark: Landmark, target: 'origin' | 'destination') => {
    if (target === 'origin') {
      setOrigin(landmark.name);
      setOriginCoords([landmark.lon, landmark.lat]);
      calculateCorridorRoutes(landmark.name, destination);
    } else {
      setDestination(landmark.name);
      setDestCoords([landmark.lon, landmark.lat]);
      calculateCorridorRoutes(origin, landmark.name);
    }
  };

  const handleAddIncident = async (newReport: IncidentReport) => {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('Location access is unavailable in this browser.'));
      navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('Allow precise location access to report a hazard within 150 m.')), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });
    let sessionId = localStorage.getItem('saferoute_session');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem('saferoute_session', sessionId);
    }
    const response = await fetch(`${API_BASE_URL}/api/post-incident`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: newReport.lat, longitude: newReport.lon,
        incident_type: newReport.category, severity: newReport.severity,
        description: newReport.description, user_id_hash: sessionId,
        reporter_lat: position.coords.latitude, reporter_lon: position.coords.longitude }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'The report was not accepted.');
    setPinnedLocation(null);
    setIsPinningMode(false);
    await refreshIncidents().catch(() => {});
    await calculateCorridorRoutes(origin, destination);
  };

  const handleStartPinning = () => {
    setIsIncidentModalOpen(false);
    setIsPinningMode(true);
  };

  const handleMapClickPin = (coords: { lat: number; lon: number }) => {
    setPinnedLocation(coords);
    setIsPinningMode(false);
    setIsIncidentModalOpen(true);
  };

  const handleResetView = () => {
    setSelectedRouteId('route-safest');
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 font-sans">
      {/* Top Google Maps Style Header */}
      <header className="h-14 border-b border-slate-200/90 bg-white/95 backdrop-blur-md px-4 lg:px-6 flex items-center justify-between z-30 flex-shrink-0 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shadow-sm">
            <Shield className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-extrabold tracking-tight text-slate-900">
                SafeRoute AI
              </h1>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Pune Metropole
              </span>
            </div>
            <p className="text-[11px] text-slate-500 hidden sm:block">
              Intelligent Urban Safety Navigation • Powered by Hyper-local RSS
            </p>
          </div>
        </div>

        {/* Badges & Incident Trigger */}
        <div className="flex items-center space-x-3">
          <div className="hidden md:flex items-center space-x-2 text-xs font-mono text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                backendHealth?.status === 'ready'
                  ? 'bg-emerald-500 animate-pulse'
                  : backendHealth?.status === 'loading'
                  ? 'bg-amber-500 animate-spin'
                  : 'bg-blue-500'
              }`}
            />
            <span>
              {backendHealth?.status === 'ready'
                ? `Engine Ready (${backendHealth.nodes?.toLocaleString()} nodes in ${backendHealth.loadTime}s)`
                : backendHealth?.status === 'loading'
                ? 'Initializing Pune Graph (Cold Start)...'
                : 'Road engine unavailable'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsIncidentModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all active:scale-95"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Report Hazard</span>
          </button>
        </div>
      </header>

      {/* Main Full-Bleed Map with Floating Google Maps Panels */}
      <div className="flex-1 relative w-full h-full overflow-hidden">
        {/* Full Viewport Map Background */}
        <div className="absolute inset-0 w-full h-full z-0">
          <Map
            routes={routes}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
            showHeatmap={showHeatmap}
            showAmenities={showAmenities}
            incidents={incidents}
            isPinningMode={isPinningMode}
            onMapClickPin={handleMapClickPin}
            originCoords={originCoords}
            destCoords={destCoords}
            originName={origin}
            destName={destination}
          />
        </div>

        {/* Floating Google Maps Left Navigation Drawer */}
        <aside
          className={`absolute top-4 left-4 bottom-4 z-20 w-[calc(100%-2rem)] sm:w-[440px] md:w-[460px] flex flex-col bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden transition-all duration-300 ${
            isPanelCollapsed ? '-translate-x-[calc(100%+24px)] pointer-events-none' : 'translate-x-0 pointer-events-auto'
          }`}
        >
          {/* Drawer Top Header with Collapse Button */}
          <div className="px-4 py-2.5 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center space-x-2 text-slate-800 text-xs font-bold">
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
              <span>Pune Safe Navigation</span>
            </div>
            <button
              type="button"
              onClick={() => setIsPanelCollapsed(true)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors"
              title="Hide panel to view full map"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Drawer Content */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
            {/* 1. Universal Origin / Destination Route Planner */}
            <RoutePlanner
              origin={origin}
              destination={destination}
              onOriginChange={setOrigin}
              onDestinationChange={setDestination}
              onSwap={handleSwapLocations}
              onSelectLandmark={handleSelectLandmark}
              onCalculateRoute={calculateCorridorRoutes}
              isLoading={isLoadingRoutes}
              originCoords={originCoords}
              destCoords={destCoords}
            />

            {routeNotice && (
              <div className="text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
                <Compass className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                <span>{routeNotice}</span>
              </div>
            )}

            {/* 2. Departure Time & Weekend Modifiers */}
            <DeparturePicker
              departureTime={departureTime}
              isWeekend={isWeekend}
              onTimeChange={setDepartureTime}
              departureDate={departureDate}
              onDateChange={setDepartureDate}
            />

            {/* 3. Radial Safety Gauge for Selected Route */}
            {selectedRoute && <RadialGauge
              score={selectedRoute.rss}
              label={`${selectedRoute.name.split(':')[0]} Safety Score`}
              riskLevel={selectedRoute.risk_level}
              subscores={selectedRoute.subscores}
              timeModifier={temporalMod.timeModifier}
              weekendModifier={temporalMod.weekendModifier}
            />}
            {selectedRoute?.score_status === 'lower_bound' && <p className="text-sm text-amber-900 bg-amber-50 rounded-lg p-3">Estimated RSS range: {selectedRoute.rss}–{selectedRoute.rss_upper}. Accident data is unknown for {selectedRoute.unknown_accident_percentage}% of this route. The gauge shows the conservative lower bound.</p>}
            {!selectedRoute && <p role="status" className="p-4 text-sm text-slate-700">{isLoadingRoutes ? 'Calculating routes on the Pune road network…' : 'Choose two Pune locations to calculate road routes.'}</p>}

            {/* 4. Comparison Cards for 3 Routes */}
            <RouteCards
              routes={routes}
              selectedRouteId={selectedRouteId}
              onSelectRoute={setSelectedRouteId}
            />
          </div>
        </aside>

        {/* Floating Expand Button when drawer is collapsed */}
        {isPanelCollapsed && (
          <button
            type="button"
            onClick={() => setIsPanelCollapsed(false)}
            className="absolute top-4 left-4 z-20 bg-white/95 border border-slate-200/90 shadow-xl px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-800 flex items-center gap-2 hover:bg-slate-50 active:scale-95 transition-all"
          >
            <Navigation className="w-4 h-4 text-blue-600" />
            <span>Open Navigation Panel</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        )}

        {/* Floating Top-Right Layer Controls & Legend */}
        <div className="absolute top-4 right-4 z-20">
          <LayerControls
            showHeatmap={showHeatmap}
            onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
            showAmenities={showAmenities}
            onToggleAmenities={() => setShowAmenities(!showAmenities)}
            onResetView={handleResetView}
            isPinningMode={isPinningMode}
            onCancelPinning={() => setIsPinningMode(false)}
          />
        </div>
      </div>

      {/* Incident Reporting Modal */}
      <IncidentModal
        isOpen={isIncidentModalOpen}
        onClose={() => setIsIncidentModalOpen(false)}
        onSubmit={handleAddIncident}
        pinnedLocation={pinnedLocation}
        onStartPinning={handleStartPinning}
      />
    </div>
  );
}

export default App;
