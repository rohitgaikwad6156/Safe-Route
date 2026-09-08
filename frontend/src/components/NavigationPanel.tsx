import { AlertTriangle, Clock, Compass, MapPin, ShieldCheck } from 'lucide-react';
import { formatDistance, formatDuration } from '../lib/utils';
import { IncidentReport, Landmark, RouteData, SafetyProfileId, TravelMode } from '../types';
import { DataReadiness, DatasetCard } from './DataReadiness';
import { DeparturePicker } from './DeparturePicker';
import { BottomSheetState, MobileBottomSheet } from './MobileBottomSheet';
import { ProfileSelector } from './ProfileSelector';
import { RadialGauge } from './RadialGauge';
import { RouteCards } from './RouteCards';
import { RoutePlanner } from './RoutePlanner';
import { SafetyConfidence } from './SafetyConfidence';
import { TravelModeSelector } from './TravelModeSelector';
import { TripConditions, WeatherContext } from './TripConditions';

interface NavigationPanelProps {
  origin: string;
  destination: string;
  originCoords: [number, number];
  destCoords: [number, number];
  departureTime: string;
  departureDate: string;
  isWeekend: boolean;
  profile: SafetyProfileId;
  travelMode: TravelMode;
  datasets: DatasetCard[];
  incidents: IncidentReport[];
  routes: RouteData[];
  selectedRoute?: RouteData;
  selectedRouteId: string;
  routeNotice: string | null;
  isLoadingRoutes: boolean;
  desktopCollapsed: boolean;
  mobileState: BottomSheetState;
  temporalModifier: { timeModifier: number; weekendModifier: number };
  weather: WeatherContext;
  onOriginChange: (value: string) => void;
  onDestinationChange: (value: string) => void;
  onSwapLocations: () => void;
  onSelectLandmark: (landmark: Landmark, target: 'origin' | 'destination') => void;
  onCalculateRoute: (origin: string, destination: string) => Promise<void>;
  onUseMyLocation: () => void;
  isLocatingOrigin: boolean;
  locationError: string | null;
  onDepartureTimeChange: (value: string) => void;
  onDepartureDateChange: (value: string) => void;
  onProfileChange: (value: SafetyProfileId) => void;
  onTravelModeChange: (value: TravelMode) => void;
  onWeatherChange: (value: WeatherContext) => void;
  onSelectRoute: (routeId: string) => void;
  onDesktopCollapsedChange: (collapsed: boolean) => void;
  onMobileStateChange: (state: BottomSheetState) => void;
}

function RouteSummary({ route, isLoading }: { route?: RouteData; isLoading: boolean }) {
  if (!route) {
    return (
      <div className="flex h-full items-center justify-between gap-3 px-5">
        <div>
          <p className="text-base font-bold text-slate-900">Plan a safer trip</p>
          <p className="text-sm text-slate-600">{isLoading ? 'Calculating Pune routes…' : 'Choose your source and destination'}</p>
        </div>
        <MapPin className="h-6 w-6 flex-shrink-0 text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[1fr_auto] items-center gap-3 px-5">
      <div className="min-w-0">
        <p className="truncate text-base font-bold text-slate-900">{route.name}</p>
        <div className="mt-1 flex items-center gap-3 text-sm text-slate-600">
          <span className="flex items-center gap-1"><Clock className="h-4 w-4" />Estimated time: {formatDuration(route.duration_seconds)}</span>
          <span>{formatDistance(route.distance_meters)}</span>
        </div>
      </div>
      <div className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-emerald-800">
        <p className="text-lg font-extrabold leading-none">{Math.round(route.rss)}</p>
        <p className="mt-1 text-xs font-semibold">Safety</p>
      </div>
    </div>
  );
}

function CompactRouteChoices({ routes, selectedRouteId, onSelectRoute }: Pick<NavigationPanelProps, 'routes' | 'selectedRouteId' | 'onSelectRoute'>) {
  return (
    <section aria-labelledby="route-choice-title">
      <h2 id="route-choice-title" className="mb-2 text-sm font-semibold text-slate-800">Choose a route</h2>
      {routes.length > 0 ? (
        <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2">
          {routes.map((route) => {
            const selected = route.id === selectedRouteId;
            return (
              <button
                key={route.id}
                type="button"
                onClick={() => onSelectRoute(route.id)}
                aria-pressed={selected}
                className={`min-h-16 min-w-[9.5rem] snap-start rounded-xl border p-3 text-left ${
                  selected ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 bg-white'
                }`}
              >
                <span className="block text-sm font-bold capitalize text-slate-900">{route.type}</span>
                <span className="mt-1 block text-sm text-slate-600">Estimated time {formatDuration(route.duration_seconds)} · {formatDistance(route.distance_meters)} · {Math.round(route.rss)} RSS</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-600">Calculate a route to compare Fastest, Safest, and Balanced options.</p>
      )}
    </section>
  );
}

function CommunityReports({ incidents }: { incidents: IncidentReport[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="community-reports-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="community-reports-title" className="text-base font-bold text-slate-900">Community reports</h2>
        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">{incidents.length} active</span>
      </div>
      {incidents.length > 0 ? (
        <div className="mt-3 space-y-2">
          {incidents.slice(0, 3).map((incident) => (
            <div key={incident.id} className="flex gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600" />
              <span><b className="capitalize">{incident.category.replace(/_/g, ' ')}</b> · {incident.description}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-600">No active community reports are available.</p>
      )}
    </section>
  );
}

export function NavigationPanel(props: NavigationPanelProps) {
  const {
    origin, destination, originCoords, destCoords, departureTime, departureDate, isWeekend, profile, travelMode,
    datasets, incidents, routes, selectedRoute, selectedRouteId, routeNotice, isLoadingRoutes,
    desktopCollapsed, mobileState, temporalModifier, weather, onOriginChange, onDestinationChange,
    onSwapLocations, onSelectLandmark, onCalculateRoute, onDepartureTimeChange, onDepartureDateChange,
    onProfileChange, onTravelModeChange, onWeatherChange, onSelectRoute, onDesktopCollapsedChange, onMobileStateChange,
    onUseMyLocation, isLocatingOrigin, locationError,
  } = props;

  const planner = (
    <>
      <RoutePlanner
        origin={origin}
        destination={destination}
        onOriginChange={onOriginChange}
        onDestinationChange={onDestinationChange}
        onSwap={onSwapLocations}
        onSelectLandmark={onSelectLandmark}
        onCalculateRoute={onCalculateRoute}
        onUseMyLocation={onUseMyLocation}
        isLocatingOrigin={isLocatingOrigin}
        locationError={locationError}
        isLoading={isLoadingRoutes}
        originCoords={originCoords}
        destCoords={destCoords}
      />
      {routeNotice ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <Compass className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
          <span>{routeNotice}</span>
        </div>
      ) : null}
    </>
  );

  const compactPlanner = (
    <RoutePlanner
      origin={origin}
      destination={destination}
      onOriginChange={onOriginChange}
      onDestinationChange={onDestinationChange}
      onSwap={onSwapLocations}
      onSelectLandmark={onSelectLandmark}
      onCalculateRoute={onCalculateRoute}
      onUseMyLocation={onUseMyLocation}
      isLocatingOrigin={isLocatingOrigin}
      locationError={locationError}
      isLoading={isLoadingRoutes}
      originCoords={originCoords}
      destCoords={destCoords}
      compact
    />
  );

  const routeEvidence = (
    <>
      {selectedRoute ? (
        <>
          <RadialGauge
            score={selectedRoute.rss}
            label={`${selectedRoute.name.split(':')[0]} Safety Score`}
            riskLevel={selectedRoute.risk_level}
            subscores={selectedRoute.subscores}
            timeModifier={temporalModifier.timeModifier}
            weekendModifier={temporalModifier.weekendModifier}
          />
          <SafetyConfidence route={selectedRoute} />
        </>
      ) : (
        <p role="status" className="rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
          {isLoadingRoutes ? 'Calculating routes on the Pune road network…' : 'Choose two Pune locations to calculate road routes.'}
        </p>
      )}
      <RouteCards
        routes={routes}
        selectedRouteId={selectedRouteId}
        onSelectRoute={onSelectRoute}
        departureTime={departureTime}
        isWeekend={isWeekend}
        weather={weather}
      />
    </>
  );

  return (
    <MobileBottomSheet
      desktopCollapsed={desktopCollapsed}
      onDesktopCollapsedChange={onDesktopCollapsedChange}
      mobileState={mobileState}
      onMobileStateChange={onMobileStateChange}
      title="Pune Safe Navigation"
      mobileCollapsedContent={<RouteSummary route={selectedRoute} isLoading={isLoadingRoutes} />}
      mobileHalfContent={(
        <div className="space-y-4 px-4 py-4 text-[15px]">
          {compactPlanner}
          <TravelModeSelector value={travelMode} onChange={onTravelModeChange} />
          <CompactRouteChoices routes={routes} selectedRouteId={selectedRouteId} onSelectRoute={onSelectRoute} />
        </div>
      )}
      mobileFullContent={(
        <div className="space-y-4 px-4 py-4 text-[15px]">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
            <ShieldCheck className="h-5 w-5" /> Safety evidence for the selected route
          </div>
          <DeparturePicker departureTime={departureTime} isWeekend={isWeekend} onTimeChange={onDepartureTimeChange} departureDate={departureDate} onDateChange={onDepartureDateChange} />
          <ProfileSelector value={profile} onChange={onProfileChange} />
          <TripConditions date={departureDate} time={departureTime} onConditionChange={onWeatherChange} />
          {routeEvidence}
          <CommunityReports incidents={incidents} />
          {datasets.length > 0 ? <DataReadiness datasets={datasets} /> : null}
        </div>
      )}
    >
      <div className="flex-1 space-y-3.5 overflow-y-auto p-3.5">
        {planner}
        <TravelModeSelector value={travelMode} onChange={onTravelModeChange} />
        <DeparturePicker departureTime={departureTime} isWeekend={isWeekend} onTimeChange={onDepartureTimeChange} departureDate={departureDate} onDateChange={onDepartureDateChange} />
        <ProfileSelector value={profile} onChange={onProfileChange} />
        {datasets.length > 0 ? <DataReadiness datasets={datasets} /> : null}
        <TripConditions date={departureDate} time={departureTime} onConditionChange={onWeatherChange} />
        {routeEvidence}
      </div>
    </MobileBottomSheet>
  );
}
