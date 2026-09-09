import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Shield, AlertTriangle, Siren } from 'lucide-react';
import { LayerControls, AmenityFilters } from './components/LayerControls';
import { IncidentModal } from './components/IncidentModal';
import { Map } from './components/Map';
import { DatasetCard } from './components/DataReadiness';
import { WeatherContext } from './components/TripConditions';
import { NavigationPanel } from './components/NavigationPanel';
import { BottomSheetState } from './components/MobileBottomSheet';
import { SosPanel } from './components/SosPanel';
import { RouteData, IncidentReport, Landmark, RouteRequest, RoutesResponse, SafetyProfileId, TravelMode } from './types';

import { computeTemporalModifier } from './lib/temporal';
import { GeocodeResult, geocodeLocation, validateBBox } from './lib/geocoding';
import { useLiveLocation } from './hooks/useLiveLocation';
import { useNavigationProgress } from './hooks/useNavigationProgress';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '' : 'http://127.0.0.1:8000')).replace(/\/$/, '');
const TRAVEL_MODE_STORAGE_KEY = 'saferoute_travel_mode';
const TRAVEL_MODES: TravelMode[] = ['walking', 'two_wheeler', 'car'];

interface ExactEndpoint {
  lat: number;
  lon: number;
  name: string;
}

interface EndpointOverrides {
  origin: ExactEndpoint | null;
  destination: ExactEndpoint | null;
}

// Keeps the research/disclosure panel available when the local Python API is offline.
// The API registry is authoritative when it is reachable.
const OFFLINE_DATASETS: DatasetCard[] = [
  { id: 'osm_network', name: 'OpenStreetMap road and pedestrian network', status: 'included_snapshot', limitations: 'Completeness varies by neighbourhood; map tags are not a safety guarantee.', source_url: 'https://www.openstreetmap.org/copyright' },
  { id: 'pmc_esr_lighting', name: 'PMC ward lighting context', status: 'included_aggregate_context', limitations: 'Ward aggregates do not prove that an individual lamp is working.', source_url: 'https://opendata.pmc.gov.in/opendata/PMCReports/ESR_2021-22.pdf' },
  { id: 'crash_history', name: 'Historical crash-risk grid', status: 'modelled_aggregate', limitations: 'A modelled risk surface, not incident-level data or a count of crashes on a street.', source_url: 'https://morth.nic.in/road-accident-in-india' },
  { id: 'community_reports', name: 'Anonymous community hazard reports', status: 'runtime_generated', limitations: 'Privacy aggregated; unverified reports receive reduced weight.', source_url: 'internal://privacy-aggregated-reports' },
  { id: 'future_authoritative_feeds', name: 'Authoritative lighting, closure and crash feeds', status: 'not_yet_integrated', limitations: 'Planned only - requires data-sharing permission and a reproducible importer.', source_url: 'https://morth.nic.in/road-accident-in-india' },
];

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
  const sourceLocationRequestSequence = React.useRef(0);
  const endpointOverrides = React.useRef<EndpointOverrides>({ origin: null, destination: null });
  const [selectedRouteId, setSelectedRouteId] = useState<string>('route-safest');
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [mobileSheetState, setMobileSheetState] = useState<BottomSheetState>('collapsed');

  // Dynamic raw routes loaded from live backend or pre-calibrated benchmark
  const [rawRoutes, setRawRoutes] = useState<RouteData[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const [routeNotice, setRouteNotice] = useState<string | null>(null);

  // Map layer states
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  // The complete OSM snapshot contains thousands of features. Keep it opt-in so
  // route interaction stays responsive on hackathon/demo laptops.
  const [amenityFilters, setAmenityFilters] = useState<AmenityFilters>({ hospitals: false, police: false, fire: false, streetlights: false, crossings: false, signals: false, safe_places: false });
  const [showCommunity, setShowCommunity] = useState(true);
  const [profile, setProfile] = useState<SafetyProfileId>('student');
  const [travelMode, setTravelMode] = useState<TravelMode>(() => {
    const storedMode = localStorage.getItem(TRAVEL_MODE_STORAGE_KEY);
    return TRAVEL_MODES.includes(storedMode as TravelMode) ? storedMode as TravelMode : 'walking';
  });
  const [weatherContext, setWeatherContext] = useState<WeatherContext>({ label: 'Forecast unavailable', rainMm: null, visibilityKm: null, available: false });
  const [isSosOpen, setIsSosOpen] = useState(false);
  const {
    requestLocation: requestSourceLocation,
    clearLocationError,
    error: sourceLocationError,
    status: sourceLocationStatus,
  } = useLiveLocation();
  const { requestLocation: requestReporterLocation } = useLiveLocation();
  const navigation = useNavigationProgress();

  // Incident reporting state with localStorage persistence
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
  const [isPinningMode, setIsPinningMode] = useState(false);
  const [pinnedLocation, setPinnedLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  // Backend Health check
  const [backendHealth, setBackendHealth] = useState<{ status: string; loadTime?: number; nodes?: number } | null>(null);
  const [datasets, setDatasets] = useState<DatasetCard[]>(OFFLINE_DATASETS);

  useEffect(() => {
    localStorage.setItem(TRAVEL_MODE_STORAGE_KEY, travelMode);
  }, [travelMode]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/datasets`, { signal: AbortSignal.timeout(5000) })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Dataset registry unavailable')))
      .then((payload) => setDatasets(Array.isArray(payload.datasets) ? payload.datasets : []))
      .catch(() => setDatasets(OFFLINE_DATASETS));
  }, []);

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
    async (origText: string, destText: string, exactEndpoints?: Partial<EndpointOverrides>) => {
      if (!origText.trim() || !destText.trim()) return;

      const sequence = ++requestSequence.current;
      setRawRoutes([]);
      setIsLoadingRoutes(true);
      setRouteNotice(null);

      try {
        const exactOrigin = exactEndpoints?.origin !== undefined
          ? exactEndpoints.origin
          : endpointOverrides.current.origin;
        const exactDestination = exactEndpoints?.destination !== undefined
          ? exactEndpoints.destination
          : endpointOverrides.current.destination;

        const fromExactCoordinates = (endpoint: ExactEndpoint): GeocodeResult => ({
          ...endpoint,
          source: 'browser_geolocation',
          offlineFallback: false,
          isInsideBBox: validateBBox(endpoint.lat, endpoint.lon).isValid,
          found: true,
        });

        // Geocode manual entries concurrently. Browser coordinates bypass text
        // geocoding so the exact GPS fix is what reaches the routing backend.
        const [origGeo, destGeo] = await Promise.all([
          exactOrigin ? Promise.resolve(fromExactCoordinates(exactOrigin)) : geocodeLocation(origText, API_BASE_URL),
          exactDestination ? Promise.resolve(fromExactCoordinates(exactDestination)) : geocodeLocation(destText, API_BASE_URL),
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
          const routeRequest: RouteRequest = {
            origin: { lat: origGeo.lat, lon: origGeo.lon, name: origDisplayName },
            destination: { lat: destGeo.lat, lon: destGeo.lon, name: destDisplayName },
            departure_time: departureTime,
            departure_date: departureDate,
            profile,
            travel_mode: travelMode,
          };
          const res = await fetch(`${API_BASE_URL}/api/routes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(routeRequest),
            signal: AbortSignal.timeout(60000),
          });

          if (!res.ok) { const error = await res.json(); backendMessage = error.message || backendMessage; }
          if (res.ok) {
            const data = await res.json() as RoutesResponse;
            if (sequence !== requestSequence.current) return;
            if (data.travel_mode !== travelMode) {
              backendMessage = 'The routing server returned a different travel mode. Please retry after the backend is updated.';
            } else if (data && Array.isArray(data.routes) && data.routes.length > 0) {
              const styledRoutes = data.routes.map((r: RouteData) => ({
                ...r,
                color: r.type === 'safest' ? '#059669' : r.type === 'balanced' ? '#d97706' : '#1a73e8'
              }));
              setRawRoutes(styledRoutes);
              const recommended = styledRoutes.find((r: RouteData) => r.profile_recommended) || styledRoutes.find((r: RouteData) => r.type === 'safest');
              setSelectedRouteId(recommended ? recommended.id : styledRoutes[0].id);
              const srcLabel = `${origGeo.source === 'nominatim_online' ? '🌐' : origGeo.source === 'backend_geocoder' ? '🔍' : origGeo.source === 'browser_geolocation' ? '📡' : '📍'} ${origDisplayName.split(',')[0]}`;
              const dstLabel = `${destGeo.source === 'nominatim_online' ? '🌐' : destGeo.source === 'backend_geocoder' ? '🔍' : destGeo.source === 'browser_geolocation' ? '📡' : '📍'} ${destDisplayName.split(',')[0]}`;
              const modeLabel = travelMode === 'two_wheeler' ? 'Two-Wheeler' : travelMode === 'car' ? 'Car' : 'Walking';
              setRouteNotice(`${modeLabel} routes calculated: ${srcLabel} → ${dstLabel}. Scores are research estimates; traffic is simulated. Access to the snapped road: ${data.snap_distances_meters?.origin || 0} m at origin, ${data.snap_distances_meters?.destination || 0} m at destination.`);
              backendSuccess = true;

              // Snap marker coordinates to the exact road-network endpoints of the polyline
              const primaryRoute = recommended || styledRoutes[0];
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
    [departureTime, departureDate, profile, travelMode]
  );

  useEffect(() => {
    if (backendHealth?.status === 'ready') calculateCorridorRoutes(origin, destination);
  }, [backendHealth?.status, departureTime, departureDate, profile, travelMode]);

  const routes = rawRoutes;
  const mapSelectedRouteId = navigation.activeRoute?.id ?? selectedRouteId;

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
    sourceLocationRequestSequence.current += 1;
    clearLocationError();
    const tempName = origin;
    const tempCoords = originCoords;
    setOrigin(destination);
    setDestination(tempName);
    setOriginCoords(destCoords);
    setDestCoords(tempCoords);

    const previousOverrides = endpointOverrides.current;
    endpointOverrides.current = {
      origin: previousOverrides.destination,
      destination: previousOverrides.origin,
    };

    calculateCorridorRoutes(destination, origin);
  };

  const handleOriginChange = useCallback((value: string) => {
    sourceLocationRequestSequence.current += 1;
    endpointOverrides.current.origin = null;
    clearLocationError();
    setOrigin(value);
  }, [clearLocationError]);

  const handleDestinationChange = useCallback((value: string) => {
    endpointOverrides.current.destination = null;
    setDestination(value);
  }, []);

  const handleUseMyLocation = useCallback(async () => {
    const sequence = ++sourceLocationRequestSequence.current;
    try {
      const position = await requestSourceLocation();
      if (sequence !== sourceLocationRequestSequence.current) return;
      const exactOrigin: ExactEndpoint = {
        lat: position.latitude,
        lon: position.longitude,
        name: 'Current Location',
      };
      endpointOverrides.current.origin = exactOrigin;
      setOrigin('Current Location');
      setOriginCoords([position.longitude, position.latitude]);
      await calculateCorridorRoutes('Current Location', destination, { origin: exactOrigin });
    } catch {
      // useLiveLocation exposes a normalized, friendly error beside the source.
      // The existing source value is intentionally left untouched.
    }
  }, [calculateCorridorRoutes, destination, requestSourceLocation]);

  const handleSelectLandmark = (landmark: Landmark, target: 'origin' | 'destination') => {
    if (target === 'origin') {
      sourceLocationRequestSequence.current += 1;
      endpointOverrides.current.origin = null;
      clearLocationError();
      setOrigin(landmark.name);
      setOriginCoords([landmark.lon, landmark.lat]);
      calculateCorridorRoutes(landmark.name, destination);
    } else {
      endpointOverrides.current.destination = null;
      setDestination(landmark.name);
      setDestCoords([landmark.lon, landmark.lat]);
      calculateCorridorRoutes(origin, landmark.name);
    }
  };

  const handleAddIncident = async (newReport: IncidentReport) => {
    const position = newReport.demo_mode ? null : await requestReporterLocation();
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
        reporter_lat: position?.latitude, reporter_lon: position?.longitude,
        demo_mode: newReport.demo_mode === true }),
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
  const handleWeatherContext = useCallback((value: WeatherContext) => setWeatherContext(value), []);

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] w-full max-w-full flex-col overflow-x-hidden bg-slate-100 font-sans text-slate-900">
      {/* Top Google Maps Style Header */}
      <header className="z-40 flex min-h-14 flex-shrink-0 items-center justify-between border-b border-slate-200/90 bg-white/95 px-3 pt-[env(safe-area-inset-top)] shadow-sm backdrop-blur-md sm:px-4 lg:px-6">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shadow-sm">
            <Shield className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-extrabold tracking-tight text-slate-900">
                SafeRoute AI
              </h1>
              <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-700 min-[360px]:inline-flex">
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
            onClick={() => setIsSosOpen(true)}
            aria-label="Share Safe Trip"
            className="flex min-h-11 min-w-11 items-center justify-center space-x-1.5 rounded-xl bg-slate-900 px-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800"
          ><Siren className="w-4 h-4"/><span className="hidden sm:inline">Share Safe Trip</span></button>
          <button
            type="button"
            onClick={() => setIsIncidentModalOpen(true)}
            aria-label="Report Hazard"
            className="flex min-h-11 items-center space-x-1.5 rounded-xl bg-rose-600 px-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-rose-700 active:scale-95"
          >
            <AlertTriangle className="w-4 h-4" />
            <span className="hidden min-[390px]:inline">Report Hazard</span>
          </button>
        </div>
      </header>

      {/* Main Full-Bleed Map with Floating Google Maps Panels */}
      <div className="relative min-h-0 w-full flex-1 overflow-hidden">
        {/* Full Viewport Map Background */}
        <div className="absolute inset-0 w-full h-full z-0">
          <Map
            routes={routes}
            selectedRouteId={mapSelectedRouteId}
            onSelectRoute={setSelectedRouteId}
            showHeatmap={showHeatmap}
            amenityFilters={amenityFilters}
            showCommunity={showCommunity}
            incidents={incidents}
            isPinningMode={isPinningMode}
            onMapClickPin={handleMapClickPin}
            originCoords={originCoords}
            destCoords={destCoords}
            originName={origin}
            destName={destination}
            mobileSheetState={mobileSheetState}
            navigationMode={navigation.isNavigating}
            currentPosition={navigation.currentPosition}
          />
        </div>

        <NavigationPanel
          origin={origin}
          destination={destination}
          originCoords={originCoords}
          destCoords={destCoords}
          departureTime={departureTime}
          departureDate={departureDate}
          isWeekend={isWeekend}
          profile={profile}
          travelMode={travelMode}
          datasets={datasets}
          incidents={incidents}
          routes={routes}
          selectedRoute={selectedRoute}
          selectedRouteId={selectedRouteId}
          routeNotice={routeNotice}
          isLoadingRoutes={isLoadingRoutes}
          desktopCollapsed={isPanelCollapsed}
          mobileState={mobileSheetState}
          temporalModifier={temporalMod}
          weather={weatherContext}
          navigation={navigation}
          onOriginChange={handleOriginChange}
          onDestinationChange={handleDestinationChange}
          onSwapLocations={handleSwapLocations}
          onSelectLandmark={handleSelectLandmark}
          onCalculateRoute={calculateCorridorRoutes}
          onUseMyLocation={handleUseMyLocation}
          isLocatingOrigin={sourceLocationStatus === 'requesting'}
          locationError={sourceLocationError?.message ?? null}
          onDepartureTimeChange={setDepartureTime}
          onDepartureDateChange={setDepartureDate}
          onProfileChange={setProfile}
          onTravelModeChange={setTravelMode}
          onWeatherChange={handleWeatherContext}
          onSelectRoute={setSelectedRouteId}
          onDesktopCollapsedChange={setIsPanelCollapsed}
          onMobileStateChange={setMobileSheetState}
        />

        {/* Floating Top-Right Layer Controls & Legend */}
        {!navigation.isNavigating ? (
          <div className="absolute top-4 right-4 z-20">
            <LayerControls
              showHeatmap={showHeatmap}
              onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
              amenityFilters={amenityFilters}
              onToggleAmenity={(key) => setAmenityFilters(current => ({ ...current, [key]: !current[key] }))}
              showCommunity={showCommunity}
              onToggleCommunity={() => setShowCommunity(value => !value)}
              onResetView={handleResetView}
              isPinningMode={isPinningMode}
              onCancelPinning={() => setIsPinningMode(false)}
            />
          </div>
        ) : null}
      </div>

      {/* Incident Reporting Modal */}
      <IncidentModal
        isOpen={isIncidentModalOpen}
        onClose={() => setIsIncidentModalOpen(false)}
        onSubmit={handleAddIncident}
        pinnedLocation={pinnedLocation}
        onStartPinning={handleStartPinning}
      />
      <SosPanel open={isSosOpen} onClose={() => setIsSosOpen(false)} origin={origin} destination={destination} route={selectedRoute} />
    </div>
  );
}

export default App;
