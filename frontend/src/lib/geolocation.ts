export interface LiveCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 0,
};

export function normalizeGeolocationError(error: GeolocationPositionError | Error): Error {
  if ('code' in error) {
    if (error.code === error.PERMISSION_DENIED) {
      return new Error('Location permission was denied. Enable location access in your browser to use GPS.');
    }
    if (error.code === error.POSITION_UNAVAILABLE) {
      return new Error('Your location could not be determined. Check GPS or network access, then try again.');
    }
    if (error.code === error.TIMEOUT) {
      return new Error('Location lookup timed out. Try again where GPS reception is clearer.');
    }
  }

  return error instanceof Error ? error : new Error('Location access failed. Please try again.');
}

function toLiveCoordinates(position: GeolocationPosition): LiveCoordinates {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    heading: position.coords.heading,
    speed: position.coords.speed,
    timestamp: position.timestamp,
  };
}

function requireGeolocation(): Geolocation {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('This browser does not support location access.');
  }
  return navigator.geolocation;
}

export function getCurrentLocation(options: PositionOptions = DEFAULT_OPTIONS): Promise<LiveCoordinates> {
  return new Promise((resolve, reject) => {
    let geolocation: Geolocation;
    try {
      geolocation = requireGeolocation();
    } catch (error) {
      reject(error);
      return;
    }

    geolocation.getCurrentPosition(
      (position) => resolve(toLiveCoordinates(position)),
      (error) => reject(normalizeGeolocationError(error)),
      options,
    );
  });
}

export function watchLocation(
  onLocation: (location: LiveCoordinates) => void,
  onError: (error: Error) => void,
  options: PositionOptions = DEFAULT_OPTIONS,
): () => void {
  const geolocation = requireGeolocation();
  const watchId = geolocation.watchPosition(
    (position) => onLocation(toLiveCoordinates(position)),
    (error) => onError(normalizeGeolocationError(error)),
    options,
  );

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    geolocation.clearWatch(watchId);
  };
}
