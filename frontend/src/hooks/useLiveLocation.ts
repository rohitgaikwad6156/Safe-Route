import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentLocation, LiveCoordinates, watchLocation } from '../lib/geolocation';

type LocationStatus = 'idle' | 'requesting' | 'tracking' | 'error';

export function useLiveLocation() {
  const [location, setLocation] = useState<LiveCoordinates | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');
  const stopWatchingRef = useRef<(() => void) | null>(null);
  const requestSequenceRef = useRef(0);

  const stopTracking = useCallback(() => {
    stopWatchingRef.current?.();
    stopWatchingRef.current = null;
    setStatus('idle');
  }, []);

  const clearLocationError = useCallback(() => {
    requestSequenceRef.current += 1;
    setError(null);
    setStatus((current) => current === 'tracking' ? current : 'idle');
  }, []);

  const requestLocation = useCallback(async () => {
    const sequence = ++requestSequenceRef.current;
    setStatus('requesting');
    setError(null);
    try {
      const nextLocation = await getCurrentLocation();
      if (sequence === requestSequenceRef.current) {
        setLocation(nextLocation);
        setStatus('idle');
      }
      return nextLocation;
    } catch (nextError) {
      const normalizedError = nextError instanceof Error ? nextError : new Error('Location access failed.');
      if (sequence === requestSequenceRef.current) {
        setError(normalizedError);
        setStatus('error');
      }
      throw normalizedError;
    }
  }, []);

  const startTracking = useCallback(() => {
    stopWatchingRef.current?.();
    stopWatchingRef.current = null;
    setError(null);
    setStatus('tracking');
    try {
      stopWatchingRef.current = watchLocation(
        (nextLocation) => {
          setLocation(nextLocation);
          setError(null);
          setStatus('tracking');
        },
        (nextError) => {
          setError(nextError);
          setStatus('error');
        },
      );
    } catch (nextError) {
      const normalizedError = nextError instanceof Error ? nextError : new Error('Location access failed.');
      setError(normalizedError);
      setStatus('error');
    }
  }, []);

  useEffect(() => () => stopWatchingRef.current?.(), []);

  return {
    location,
    error,
    status,
    isTracking: status === 'tracking',
    requestLocation,
    clearLocationError,
    startTracking,
    stopTracking,
  };
}
