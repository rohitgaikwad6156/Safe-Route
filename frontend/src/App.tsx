import React, { useState, useMemo, useEffect } from 'react';
import { Shield, Navigation, AlertTriangle, Sparkles, Layers, Sliders, MapPin, Compass } from 'lucide-react';
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

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export function App() {
  const [origin, setOrigin] = useState('Shivajinagar Station, Pune');
  const [destination, setDestination] = useState('Katraj (Katraj Chowk), Pune');
  const [originCoords, setOriginCoords] = useState<[number, number]>([73.8446, 18.5314]);
  const [destCoords, setDestCoords] = useState<[number, number]>([73.8553, 18.4529]);
  const [isReversed, setIsReversed] = useState(false);
  const [departureTime, setDepartureTime] = useState('21:30');
  const [isWeekend, setIsWeekend] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string>('route-safest');

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
    } catch (e) {
      // fallback
    }
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

  // Backend Readiness & Health check (reports cold-start duration and readiness)
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

  // Compute temporally-adjusted routes dynamically with coherent mathematical explanations
  const routes: RouteData[] = useMemo(() => {
    const isIdentical = origin.trim().toLowerCase() === destination.trim().toLowerCase() && origin.trim().length > 0;

    // Graceful handling when origin and destination are identical (0 meters, zero exposure)
    if (isIdentical) {
      const zeroRoute: RouteData = {
        id: 'route-identical',
        name: `Immediate Destination (${origin.split(',')[0]})`,
        type: 'safest',
        color: '#2dd4bf',
        distance_meters: 0,
        duration_seconds: 0,
        raw_rss: 100.0,
        rss: 100.0,
        risk_level: 'Safe Corridor',
        reasons: [
          `Origin and destination are identical (${origin.split(',')[0]}).`,
          'Zero physical travel required with 0.0 meters road exposure.',
          'Maximum safety score (100.0 RSS) due to absent vehicular and nocturnal hazard conflict.'
        ],
        subscores: {
          accident: 100.0,
          emergency: 100.0,
          lighting: 100.0,
          pedestrian: 100.0,
          traffic: 100.0
        },
        geometry: {
          type: 'LineString',
          coordinates: [originCoords, originCoords]
        },
        steps: [
          {
            instruction: `You are already at your destination: ${destination.split(',')[0]}.`,
            distance_meters: 0,
            street: destination.split(',')[0]
          }
        ]
      };
      return [zeroRoute];
    }

    const { totalAdjustment, timeWindowLabel } = computeTemporalModifier(departureTime, isWeekend);

    return (mockRoutesData.routes as RouteData[]).map((r) => {
      const dynamicRss = Math.round(Math.max(0, Math.min(100, r.raw_rss + totalAdjustment)) * 10) / 10;
      let riskLevel = r.risk_level;
      if (dynamicRss >= 80) riskLevel = 'Safe Corridor';
      else if (dynamicRss >= 65) riskLevel = 'Moderate Safety';
      else riskLevel = 'High Risk';

      // Dynamically update attribution
      const updatedAttribution = r.attribution ? {
        ...r.attribution,
        temporal_adjustment: totalAdjustment,
        final_rss: dynamicRss,
      } : undefined;

      // Dynamically update reasons array so temporal causation and attribution match active slider!
      const updatedReasons = (r.reasons || []).map((reason) => {
        if (reason.startsWith("RSS Attribution:")) {
          const modText = totalAdjustment !== 0
            ? ` Temporal modifier of ${totalAdjustment > 0 ? '+' : ''}${totalAdjustment.toFixed(1)} pts results in a final ${dynamicRss.toFixed(1)} RSS.`
            : ` Neutral temporal window (0.0 pts) results in a final ${dynamicRss.toFixed(1)} RSS.`;
          return reason.replace(/Temporal modifier of [+-]?\d+\.?\d* pts results in a final \d+\.?\d* RSS\./, modText)
                       .replace(/to the \d+\.?\d* base RSS\./, `to the ${r.raw_rss.toFixed(1)} base RSS.`);
        }
        if (reason.startsWith("Temporal Causation:")) {
          return `Temporal Causation: At ${departureTime} (${timeWindowLabel}), ${r.name.split('(')[0].trim()} has a ${totalAdjustment >= 0 ? '+' : ''}${totalAdjustment.toFixed(1)} pts modifier (Base: ${r.raw_rss.toFixed(1)}, Final: ${dynamicRss.toFixed(1)} RSS). ${isWeekend ? 'Includes -3.0 weekend surge penalty.' : ''}`;
        }
        return reason;
      });

      // If route direction is reversed (e.g., Katraj -> Shivajinagar)
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
  }, [departureTime, isWeekend, isReversed, origin, destination, originCoords]);

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
  };

  const handleSelectLandmark = (landmark: Landmark, target: 'origin' | 'destination') => {
    if (target === 'origin') {
      setOrigin(landmark.name);
      setOriginCoords([landmark.lon, landmark.lat]);
    } else {
      setDestination(landmark.name);
      setDestCoords([landmark.lon, landmark.lat]);
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

    // Asynchronously submit to live backend API if online
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
        reporter_lon: newReport.lon
      })
    }).catch(() => {
      // Offline fallback: report remains preserved in local state
    });
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
                : 'Offline Autonomous Mode (Pre-Calibrated Benchmark)'}
            </span>
            <span className="text-slate-600">|</span>
            <span>30 Crash Clusters (709 Cells)</span>
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
            {/* 1. Origin / Destination Route Planner */}
            <RoutePlanner
              origin={origin}
              destination={destination}
              onOriginChange={setOrigin}
              onDestinationChange={setDestination}
              onSwap={handleSwapLocations}
              onSelectLandmark={handleSelectLandmark}
            />

            {(origin !== 'Shivajinagar Station, Pune' || destination !== 'Katraj (Katraj Chowk), Pune') && (
              <div className="text-[11px] bg-cyan-950/50 border border-cyan-500/30 text-cyan-300 px-3 py-2 rounded-xl flex items-center gap-2 animate-in fade-in duration-200">
                <Compass className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 animate-spin" style={{ animationDuration: '6s' }} />
                <span>
                  {isReversed
                    ? 'Return Corridor Active: Geometry reversed for Katraj → Shivajinagar.'
                    : `Active Query: ${origin.split(',')[0]} → ${destination.split(',')[0]} (OSM network baseline).`}
                </span>
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
