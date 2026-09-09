import { Clock3, LocateFixed, MapPin, Navigation, ShieldCheck, Square } from 'lucide-react';
import { LiveCoordinates } from '../lib/geolocation';
import { RouteProgressSnapshot } from '../lib/routeProgress';
import { formatDistance, formatDuration } from '../lib/utils';
import { RouteData } from '../types';

interface NavigationProgressProps {
  route: RouteData;
  destination: string;
  currentPosition: LiveCoordinates | null;
  locationStatus: string;
  locationError: Error | null;
  progress: RouteProgressSnapshot;
  onEnd: () => void;
  compact?: boolean;
}

function confidenceLabel(route: RouteData): string {
  if (!route.uncertainty) return 'Estimated confidence';
  return route.uncertainty.overall_confidence === 'verified'
    ? `${Math.round(route.uncertainty.overall_verified_percentage)}% verified`
    : `${Math.round(route.uncertainty.overall_verified_percentage)}% data verified`;
}

function confidenceBand(route: RouteData): string {
  const verifiedPercentage = route.uncertainty?.overall_verified_percentage;
  if (verifiedPercentage === undefined) return 'Estimated';
  if (verifiedPercentage >= 75) return 'High';
  if (verifiedPercentage >= 40) return 'Medium';
  return 'Low';
}

function routeHeading(route: RouteData): string {
  const routeName = route.name.replace(/\s+route$/i, '').toUpperCase();
  return route.profile_recommended || route.type === 'safest'
    ? `${routeName} — Recommended`
    : routeName;
}

export function NavigationProgress({
  route,
  destination,
  currentPosition,
  locationStatus,
  locationError,
  progress,
  onEnd,
  compact = false,
}: NavigationProgressProps) {
  const roundedProgress = Math.round(progress.progressPercentage);

  if (compact) {
    return (
      <div className="grid h-full grid-cols-[1fr_auto] items-center gap-3 px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-emerald-800">{routeHeading(route)}</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-900">
            {formatDistance(progress.remainingDistanceMeters)} remaining · {formatDuration(progress.remainingDurationSeconds)} estimated · {roundedProgress}% complete
          </p>
          <p className="mt-1 truncate text-sm text-slate-600">
            Safety: {Math.round(route.rss)}/100 · Confidence: {confidenceBand(route)}
          </p>
        </div>
        <button
          type="button"
          onClick={onEnd}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-3 text-sm font-bold text-white"
        >
          <Square className="h-4 w-4 fill-current" /> End
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-4 shadow-lg" aria-labelledby="live-navigation-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-emerald-700">
            <Navigation className="h-4 w-4" /> {routeHeading(route)}
          </p>
          <h2 id="live-navigation-title" className="mt-1 truncate text-xl font-extrabold text-slate-950">{route.name}</h2>
          <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-600"><MapPin className="h-4 w-4 text-rose-600" /> {destination}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-emerald-800">
          <p className="text-xl font-extrabold leading-none">{Math.round(route.rss)}</p>
          <p className="mt-1 text-xs font-semibold">Safety</p>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
          <span>Trip progress</span><span>{roundedProgress}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={roundedProgress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-500" style={{ width: `${roundedProgress}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Remaining distance</p>
          <p className="mt-1 text-lg font-extrabold text-slate-900">{formatDistance(progress.remainingDistanceMeters)}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Estimated remaining time</p>
          <p className="mt-1 flex items-center gap-1.5 text-lg font-extrabold text-slate-900"><Clock3 className="h-4 w-4" /> {formatDuration(progress.remainingDurationSeconds)}</p>
        </div>
      </div>

      <p className="text-sm text-slate-600">
        {formatDistance(progress.distanceTravelledMeters)} travelled along the selected route · {roundedProgress}% complete
      </p>

      <div className="rounded-xl border border-slate-200 p-3 text-sm">
        <p className="flex items-center gap-2 font-bold text-slate-900"><LocateFixed className="h-4 w-4 text-blue-600" /> Current position</p>
        {currentPosition ? (
          <>
            <p className="mt-1 font-mono text-xs text-slate-600">
              {currentPosition.latitude.toFixed(5)}, {currentPosition.longitude.toFixed(5)} · accuracy ±{Math.round(currentPosition.accuracy)} m
            </p>
            {currentPosition.heading !== null ? (
              <p className="mt-1 text-xs text-slate-500">Heading {Math.round(currentPosition.heading)}°</p>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-600">{locationStatus === 'error' ? 'Location unavailable' : 'Acquiring your GPS position…'}</p>
        )}
        {progress.distanceFromRouteMeters !== null ? (
          <p className="mt-1 text-xs text-slate-500">Approximately {Math.round(progress.distanceFromRouteMeters)} m from the selected route.</p>
        ) : null}
        {locationError ? <p role="alert" className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{locationError.message}</p> : null}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
        <span className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5" /> Safety confidence</span>
        <span className="text-right font-bold">{confidenceBand(route)} · {confidenceLabel(route)}</span>
      </div>

      <button
        type="button"
        onClick={onEnd}
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-rose-700"
      >
        <Square className="h-4 w-4 fill-current" /> End Navigation
      </button>
    </section>
  );
}
