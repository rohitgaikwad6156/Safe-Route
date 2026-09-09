import { useCallback, useMemo, useState } from 'react';
import { RouteData } from '../types';
import { calculateRouteProgress, prepareRouteGeometry } from '../lib/routeProgress';
import { useLiveLocation } from './useLiveLocation';

export function useNavigationProgress() {
  const [activeRoute, setActiveRoute] = useState<RouteData | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const { location, error, status, startTracking, stopTracking } = useLiveLocation();

  const startNavigation = useCallback((route: RouteData) => {
    setActiveRoute(route);
    setStartedAt(Date.now());
    startTracking();
  }, [startTracking]);

  const endNavigation = useCallback(() => {
    stopTracking();
    setActiveRoute(null);
    setStartedAt(null);
  }, [stopTracking]);

  const currentPosition = location && startedAt !== null && location.timestamp >= startedAt
    ? location
    : null;
  const preparedGeometry = useMemo(
    () => activeRoute ? prepareRouteGeometry(activeRoute) : null,
    [activeRoute],
  );
  const progress = useMemo(
    () => activeRoute && preparedGeometry
      ? calculateRouteProgress(activeRoute, currentPosition, preparedGeometry)
      : null,
    [activeRoute, currentPosition, preparedGeometry],
  );

  return {
    isNavigating: activeRoute !== null,
    activeRoute,
    currentPosition,
    locationError: error,
    locationStatus: status,
    progress,
    startNavigation,
    endNavigation,
  };
}
