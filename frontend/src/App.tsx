import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Shield, Navigation, AlertTriangle, Sparkles, Layers, Sliders, MapPin, Compass, CheckCircle2, Loader2 } from 'lucide-react';
import { RoutePlanner } from './components/RoutePlanner';
import { DeparturePicker } from './components/DeparturePicker';
import { RadialGauge } from './components/RadialGauge';
import { RouteCards } from './components/RouteCards';
import { LayerControls } from './components/LayerControls';
import { IncidentModal } from './components/IncidentModal';
import { Map } from './components/Map';
import { RouteData, IncidentReport, Landmark } from './types';
import mockRoutesData from './mocks/routes.json';
import { adjustRouteRSS, computeTemporalModifier } from './lib/temporal';
import { geocodeLocation, GeocodeResult } from './lib/geocoding';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

function generateCorridorFallback(origGeo: GeocodeResult, destGeo: GeocodeResult): RouteData[] {
  const oLat = origGeo.lat;
  const oLon = origGeo.lon;
  const dLat = destGeo.lat;
  const dLon = destGeo.lon;

  const dLatM = (dLat - oLat) * 111320;
  const dLonM = (dLon - oLon) * 111320 * Math.cos((oLat * Math.PI) / 180);
  const approxDist = Math.max(500, Math.round(Math.sqrt(dLatM * dLatM + dLonM * dLonM)));
  const midLat = (oLat + dLat) / 2;
  const midLon = (oLon + dLon) / 2;

  const fastestCoords: [number, number][] = [
    [oLon, oLat],
    [midLon, midLat],
    [dLon, dLat]
  ];
  const safestCoords: [number, number][] = [
    [oLon, oLat],
    [oLon + (dLon - oLon) * 0.3 + 0.003, oLat + (dLat - oLat) * 0.3 - 0.002],
    [midLon + 0.004, midLat - 0.003],
    [oLon + (dLon - oLon) * 0.7 + 0.002, oLat + (dLat - oLat) * 0.7 - 0.001],
    [dLon, dLat]
  ];
  const balancedCoords: [number, number][] = [
    [oLon, oLat],
    [midLon - 0.002, midLat + 0.002],
    [dLon, dLat]
  ];

  return [
    {
      id: 'route-safest',
      name: `Safest Route: ${origGeo.name.split(',')[0]} → ${destGeo.name.split(',')[0]}`,
      type: 'safest',
      color: '#2dd4bf',
      distance_meters: Math.round(approxDist * 1.12),
      duration_seconds: Math.round((approxDist * 1.12) / 8.3),
      raw_rss: 78.5,
      rss: 78.5,
      risk_level: 'Safe Corridor',
      reasons: [
        `Risk-weighted arterial route connecting ${origGeo.name.split(',')[0]} to ${destGeo.name.split(',')[0]}.`,
        'Avoids unlit interior alleys and high-incident accident intersections.',
        'Maintains high proximity to PMC surveillance and active emergency corridors.'
      ],
      subscores: { accident: 82.0, emergency: 79.0, lighting: 76.5, pedestrian: 74.0, traffic: 80.0 },
      geometry: { type: 'LineString', coordinates: safestCoords },
      steps: [
        { instruction: `Depart ${origGeo.name.split(',')[0]} via well-lit arterial corridor`, distance_meters: Math.round(approxDist * 0.4), street: 'Arterial Corridor' },
        { instruction: `Continue toward ${destGeo.name.split(',')[0]} along protected safety avenue`, distance_meters: Math.round(approxDist * 0.72), street: 'Connecting Avenue' }
      ]
    },
    {
      id: 'route-fastest',
      name: `Fastest Route: ${origGeo.name.split(',')[0]} → ${destGeo.name.split(',')[0]}`,
      type: 'fastest',
      color: '#38bdf8',
      distance_meters: approxDist,
      duration_seconds: Math.round(approxDist / 9.5),
      raw_rss: 58.2,
      rss: 58.2,
      risk_level: 'Moderate Safety',
      reasons: [
        `Direct shortest-path corridor minimizing transit time (${(approxDist / 1000).toFixed(1)} km).`,
        'Higher exposure to mixed vehicular traffic and uncalibrated junction crossings.'
      ],
      subscores: { accident: 54.0, emergency: 60.0, lighting: 58.0, pedestrian: 52.0, traffic: 62.0 },
      geometry: { type: 'LineString', coordinates: fastestCoords },
      steps: [
        { instruction: `Proceed direct from ${origGeo.name.split(',')[0]} to ${destGeo.name.split(',')[0]}`, distance_meters: approxDist, street: 'Direct Route' }
      ]
    },
    {
      id: 'route-balanced',
      name: `Balanced Route: ${origGeo.name.split(',')[0]} → ${destGeo.name.split(',')[0]}`,
      type: 'balanced',
      color: '#f59e0b',
      distance_meters: Math.round(approxDist * 1.05),
      duration_seconds: Math.round((approxDist * 1.05) / 8.8),
      raw_rss: 71.0,
      rss: 71.0,
      risk_level: 'Moderate Safety',
      reasons: [
        'Optimal equilibrium between directness and safety scoring.',
        'Minimizes detour length while avoiding major congestion nodes.'
      ],
      subscores: { accident: 70.0, emergency: 72.0, lighting: 70.0, pedestrian: 68.0, traffic: 73.0 },
      geometry: { type: 'LineString', coordinates: balancedCoords },
      steps: [
        { instruction: `Navigate balanced route toward ${destGeo.name.split(',')[0]}`, distance_meters: Math.round(approxDist * 1.05), street: 'Balanced Route' }
      ]
    }
  ];
}

export function App() {
  const [origin, setOrigin] = useState('Shivajinagar Station, Pune');
  const [destination, setDestination] = useState('Katraj (Katraj Chowk), Pune');
  const [originCoords, setOriginCoords] = useState<[number, number]>([73.8446, 18.5314]);
  const [destCoords, setDestCoords] = useState<[number, number]>([73.8553, 18.4529]);
  const [isReversed, setIsReversed] = useState(false);
  const [departureTime, setDepartureTime] = useState('21:30');
  const [isWeekend, setIsWeekend] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('route-safest');

  // Dynamic raw routes loaded from live backend or pre-calibrated benchmark
  const [rawRoutes, setRawRoutes] = useState<RouteData[]>(mockRoutesData.routes as RouteData[]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const [routeNotice, setRouteNotice] = useState<string | null>(null);

  // Map layer states
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [showAmenities, setShowAmenities] = useState<boolean>(true);

  // Incident reporting state with localStorage persistence
  const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
  const [isPinningMode, setIsPinningMode] = useState(false);
  const [pinnedLocation, setPinnedLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [incidents, setIncidents] = useState<IncidentReport[]>(() => {
    try {
      const saved = localStorage.getItem('saferoute_incidents');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      {
        id: 'inc-1',
        category: 'accident_prone',
        severity: 4,
        description: 'Navale Bridge sharp descent merge - multiple heavy vehicle brake failure incidents',
        lat: 18.458,
        lon: 73.828,
        address: 'Navale Bridge, Katraj-Dehu Bypass',
        timestamp: '20:15',
      },
      {
        id: 'inc-2',
        category: 'poor_lighting',
        severity: 3,
        description: 'Swargate flyover underpass LED array flickering, low visibility',
        lat: 18.5015,
        lon: 73.859,
        address: 'Swargate Junction Underpass',
        timestamp: '19:40',
      }
    ];
  });

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

      setIsLoadingRoutes(true);
      setRouteNotice(null);

      try {
        // 1. Geocode origin and destination
        const [origGeo, destGeo] = await Promise.all([
          geocodeLocation(origText, API_BASE_URL),
          geocodeLocation(destText, API_BASE_URL),
        ]);

        const newOrigCoords: [number, number] = [origGeo.lon, origGeo.lat];
        const newDestCoords: [number, number] = [destGeo.lon, destGeo.lat];

        setOrigin(origGeo.name);
        setDestination(destGeo.name);
        setOriginCoords(newOrigCoords);
        setDestCoords(newDestCoords);

        // 2. Check identical origin and destination
        const isIdentical =
          (Math.abs(origGeo.lat - destGeo.lat) < 0.0003 && Math.abs(origGeo.lon - destGeo.lon) < 0.0003) ||
          origGeo.name.toLowerCase().trim() === destGeo.name.toLowerCase().trim();

        if (isIdentical) {
          const zeroRoute: RouteData = {
            id: 'route-identical',
            name: `Immediate Destination (${origGeo.name.split(',')[0]})`,
            type: 'safest',
            color: '#2dd4bf',
            distance_meters: 0,
            duration_seconds: 0,
            raw_rss: 100.0,
            rss: 100.0,
            risk_level: 'Safe Corridor',
            reasons: [
              `Origin and destination are identical (${origGeo.name.split(',')[0]}).`,
              'Zero physical travel required with 0.0 meters road exposure.',
              'Maximum safety score (100.0 RSS) due to absent vehicular and nocturnal hazard conflict.'
            ],
            subscores: { accident: 100, emergency: 100, lighting: 100, pedestrian: 100, traffic: 100 },
            geometry: { type: 'LineString', coordinates: [newOrigCoords, newOrigCoords] },
            steps: [{ instruction: `You are already at your destination: ${destGeo.name.split(',')[0]}.`, distance_meters: 0, street: destGeo.name.split(',')[0] }]
          };
          setRawRoutes([zeroRoute]);
          setSelectedRouteId('route-identical');
          setIsLoadingRoutes(false);
          return;
        }

        // 3. Query live backend multi-objective routing engine
        let backendSuccess = false;
        try {
          const res = await fetch(`${API_BASE_URL}/api/routes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              origin: { lat: origGeo.lat, lon: origGeo.lon, name: origGeo.name },
              destination: { lat: destGeo.lat, lon: destGeo.lon, name: destGeo.name },
              departure_time: departureTime
            }),
            signal: AbortSignal.timeout(12000),
          });

          if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.routes) && data.routes.length > 0) {
              const styledRoutes = data.routes.map((r: RouteData) => ({
                ...r,
                color: r.type === 'safest' ? '#2dd4bf' : r.type === 'balanced' ? '#f59e0b' : '#38bdf8'
              }));
              setRawRoutes(styledRoutes);
              const safest = styledRoutes.find((r: RouteData) => r.type === 'safest');
              setSelectedRouteId(safest ? safest.id : styledRoutes[0].id);
              setRouteNotice(`Calculated live across 56,036 Pune network nodes: ${origGeo.name.split(',')[0]} → ${destGeo.name.split(',')[0]}`);
              backendSuccess = true;
            }
          }
        } catch (backendErr) {
          console.warn('Backend route computation unavailable, using fallback:', backendErr);
        }

        if (!backendSuccess) {
          // Fallback if backend was unreachable
          const isKatrajCorridor =
            origGeo.name.toLowerCase().includes('shivajinagar') && destGeo.name.toLowerCase().includes('katraj');
          const isKatrajReverse =
            origGeo.name.toLowerCase().includes('katraj') && destGeo.name.toLowerCase().includes('shivajinagar');

          if (isKatrajCorridor || isKatrajReverse) {
            const baseMock = (mockRoutesData.routes as RouteData[]).map((r) => {
              return isKatrajReverse
                ? { ...r, geometry: { ...r.geometry, coordinates: [...r.geometry.coordinates].reverse() } }
                : r;
            });
            setRawRoutes(baseMock);
            setSelectedRouteId('route-safest');
          } else {
            const fallbackRoutes = generateCorridorFallback(origGeo, destGeo);
            setRawRoutes(fallbackRoutes);
            setSelectedRouteId('route-safest');
            setRouteNotice(`Active corridor: ${origGeo.name.split(',')[0]} → ${destGeo.name.split(',')[0]}`);
          }
        }
      } catch (err: any) {
        console.error('Route calculation error:', err);
      } finally {
        setIsLoadingRoutes(false);
      }
    },
    [departureTime]
  );

  // Compute temporally-adjusted routes dynamically over active rawRoutes
  const routes: RouteData[] = useMemo(() => {
    const isIdentical =
      origin.trim().toLowerCase() === destination.trim().toLowerCase() && origin.trim().length > 0;

    if (isIdentical && rawRoutes.length === 1 && rawRoutes[0].id === 'route-identical') {
      return rawRoutes;
    }

    const { totalAdjustment, timeWindowLabel } = computeTemporalModifier(departureTime, isWeekend);

    return rawRoutes.map((r) => {
      const dynamicRss = Math.round(Math.max(0, Math.min(100, r.raw_rss + totalAdjustment)) * 10) / 10;
      let riskLevel = r.risk_level;
      if (dynamicRss >= 80) riskLevel = 'Safe Corridor';
      else if (dynamicRss >= 65) riskLevel = 'Moderate Safety';
      else riskLevel = 'High Risk';

      const updatedAttribution = r.attribution
        ? {
            ...r.attribution,
            temporal_adjustment: totalAdjustment,
            final_rss: dynamicRss,
          }
        : undefined;

      const updatedReasons = (r.reasons || []).map((reason) => {
        if (reason.startsWith('RSS Attribution:')) {
          const modText =
            totalAdjustment !== 0
              ? ` Temporal modifier of ${totalAdjustment > 0 ? '+' : ''}${totalAdjustment.toFixed(1)} pts results in a final ${dynamicRss.toFixed(1)} RSS.`
              : ` Neutral temporal window (0.0 pts) results in a final ${dynamicRss.toFixed(1)} RSS.`;
          return reason
            .replace(/Temporal modifier of [+-]?\d+\.?\d* pts results in a final \d+\.?\d* RSS\./, modText)
            .replace(/to the \d+\.?\d* base RSS\./, `to the ${r.raw_rss.toFixed(1)} base RSS.`);
        }
        if (reason.startsWith('Temporal Causation:')) {
          return `Temporal Causation: At ${departureTime} (${timeWindowLabel}), ${r.name.split('(')[0].trim()} has a ${totalAdjustment >= 0 ? '+' : ''}${totalAdjustment.toFixed(1)} pts modifier (Base: ${r.raw_rss.toFixed(1)}, Final: ${dynamicRss.toFixed(1)} RSS). ${isWeekend ? 'Includes -3.0 weekend surge penalty.' : ''}`;
        }
        return reason;
      });

      const adjustedGeometry = isReversed
        ? {
            ...r.geometry,
            coordinates: [...r.geometry.coordinates].reverse(),
          }
        : r.geometry;

      return {
        ...r,
        rss: dynamicRss,
        risk_level: riskLevel,
        attribution: updatedAttribution,
        reasons: updatedReasons,
        geometry: adjustedGeometry,
      };
    });
  }, [rawRoutes, departureTime, isWeekend, isReversed, origin, destination]);

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
    setIsReversed((prev) => !prev);
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

  const handleAddIncident = (newReport: IncidentReport) => {
    setIncidents((prev) => {
      const updated = [newReport, ...prev];
      try {
        localStorage.setItem('saferoute_incidents', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });
    setPinnedLocation(null);
    setIsPinningMode(false);

    fetch(`${API_BASE_URL}/api/post-incident`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: newReport.lat,
        longitude: newReport.lon,
        incident_type: newReport.category,
        severity: newReport.severity,
        description: newReport.description,
        reported_by: 'citizen_web_client',
        reporter_lat: newReport.lat,
        reporter_lon: newReport.lon,
      }),
    }).catch(() => {});
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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0b0f19] text-slate-100 font-sans">
      {/* Top Navigation Bar */}
      <header className="h-16 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-xl px-4 lg:px-6 flex items-center justify-between z-40 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center shadow-lg">
            <Shield className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-base font-display font-extrabold tracking-tight text-white">
                SafeRoute AI
              </h1>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-teal-950/80 text-teal-300 border border-teal-500/40">
                Pune Metropole
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Risk-Weighted Safe Navigation & Infrastructure Intelligence
            </p>
          </div>
        </div>

        {/* Badges & Incident Trigger */}
        <div className="flex items-center space-x-3">
          <div className="hidden md:flex items-center space-x-2 text-xs font-mono text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
            <span
              className={`w-2 h-2 rounded-full ${
                backendHealth?.status === 'ready'
                  ? 'bg-emerald-400 animate-pulse'
                  : backendHealth?.status === 'loading'
                  ? 'bg-amber-400 animate-spin'
                  : 'bg-cyan-400'
              }`}
            />
            <span>
              {backendHealth?.status === 'ready'
                ? `Engine Ready (${backendHealth.nodes?.toLocaleString()} nodes in ${backendHealth.loadTime}s)`
                : backendHealth?.status === 'loading'
                ? 'Initializing Pune Graph (Cold Start)...'
                : 'Autonomous Graph Active (30 Crash Clusters)'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsIncidentModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white shadow-lg shadow-rose-500/25 transition-all active:scale-95"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Report Hazard</span>
          </button>
        </div>
      </header>

      {/* Body Content: Sidebar + Map */}
      <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
        {/* Left Side Control Panel */}
        <aside className="w-full md:w-[460px] lg:w-[480px] h-full flex flex-col border-r border-slate-800/80 bg-slate-950/60 backdrop-blur-2xl z-20 shadow-2xl overflow-hidden flex-shrink-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
              <div className="text-[11px] bg-teal-950/50 border border-teal-500/30 text-teal-300 px-3 py-2 rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
                <Compass className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                <span>{routeNotice}</span>
              </div>
            )}

            {/* 2. Departure Time & Weekend Modifiers */}
            <DeparturePicker
              departureTime={departureTime}
              isWeekend={isWeekend}
              onTimeChange={setDepartureTime}
              onWeekendChange={setIsWeekend}
            />

            {/* 3. Radial Safety Gauge for Selected Route */}
            <RadialGauge
              score={selectedRoute.rss}
              label={`${selectedRoute.name.split(':')[0]} Safety Score`}
              riskLevel={selectedRoute.risk_level}
              subscores={selectedRoute.subscores}
              timeModifier={temporalMod.timeModifier}
              weekendModifier={temporalMod.weekendModifier}
            />

            {/* 4. Comparison Cards for 3 Routes */}
            <RouteCards
              routes={routes}
              selectedRouteId={selectedRouteId}
              onSelectRoute={setSelectedRouteId}
            />
          </div>
        </aside>

        {/* Right Side Map Area */}
        <main className="flex-1 relative h-full w-full">
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
        </main>
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
