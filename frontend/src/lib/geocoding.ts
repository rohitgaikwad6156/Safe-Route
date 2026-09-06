/**
 * SafeRoute AI: Offline-First Geocoding & Spatial Bounds Validation.
 * Guarantees zero-network resilience using committed landmarks,
 * live backend geocoding, and OpenStreetMap Nominatim.
 */
import landmarksData from '../mocks/landmarks.json';
import { Landmark } from '../types';

export const PUNE_BBOX = {
  minLat: 18.380, // Katraj / Kondhwa / Jambhulwadi / Saswad road
  maxLat: 18.680, // PCMC / Akurdi / Bhosari / Pune Airport
  minLon: 73.700, // Hinjewadi / Wakad / Bavdhan / Pirangut
  maxLon: 74.020, // Hadapsar / Wagholi / Kharadi / Manjari
};

export const SUPPORTED_AREAS = [
  'Shivajinagar',
  'Katraj',
  'Kothrud',
  'Aundh',
  'Swargate',
  'Hadapsar',
  'Baner',
  'Hinjawadi',
  'Viman Nagar',
  'Deccan Gymkhana',
  'PCMC',
  'Kharadi',
  'Koregaon Park'
];

export interface GeocodeResult {
  name: string;
  lat: number;
  lon: number;
  source: 'offline_landmark_registry' | 'nominatim_online' | 'backend_geocoder';
  offlineFallback: boolean;
  isInsideBBox: boolean;
}

export function validateBBox(lat: number, lon: number): { isValid: boolean; message?: string } {
  if (lat < PUNE_BBOX.minLat || lat > PUNE_BBOX.maxLat || lon < PUNE_BBOX.minLon || lon > PUNE_BBOX.maxLon) {
    return {
      isValid: false,
      message: `Coordinates (${lat.toFixed(3)}, ${lon.toFixed(3)}) are outside the Pune service area (${PUNE_BBOX.minLat}–${PUNE_BBOX.maxLat}°N, ${PUNE_BBOX.minLon}–${PUNE_BBOX.maxLon}°E). Supported hubs cover ${SUPPORTED_AREAS.slice(0, 7).join(', ')}.`,
    };
  }
  return { isValid: true };
}

export function searchPuneLandmarks(query: string, limit: number = 6): Landmark[] {
  if (!query || query.trim().length === 0) {
    return (landmarksData as Landmark[]).slice(0, limit);
  }
  const q = query.trim().toLowerCase();
  const landmarks = landmarksData as Landmark[];
  
  return landmarks.filter((item) => {
    const matchName = item.name.toLowerCase().includes(q);
    const matchWard = item.ward?.toLowerCase().includes(q);
    const matchAliases = item.aliases?.some((a) => a.toLowerCase().includes(q));
    return matchName || matchWard || matchAliases;
  }).slice(0, limit);
}

export function geocodeOffline(query: string): GeocodeResult {
  const q = query.trim().toLowerCase();
  const landmarks = landmarksData as Landmark[];

  // 1. Direct or alias match
  for (const lm of landmarks) {
    if (lm.name.toLowerCase().includes(q)) {
      const bboxCheck = validateBBox(lm.lat, lm.lon);
      return {
        name: lm.name,
        lat: lm.lat,
        lon: lm.lon,
        source: 'offline_landmark_registry',
        offlineFallback: true,
        isInsideBBox: bboxCheck.isValid,
      };
    }
    if (lm.aliases?.some((a) => a.toLowerCase().includes(q))) {
      const bboxCheck = validateBBox(lm.lat, lm.lon);
      return {
        name: lm.name,
        lat: lm.lat,
        lon: lm.lon,
        source: 'offline_landmark_registry',
        offlineFallback: true,
        isInsideBBox: bboxCheck.isValid,
      };
    }
  }

  // 2. Ward or partial match
  for (const lm of landmarks) {
    if (lm.ward && lm.ward.toLowerCase().includes(q)) {
      const bboxCheck = validateBBox(lm.lat, lm.lon);
      return {
        name: lm.name,
        lat: lm.lat,
        lon: lm.lon,
        source: 'offline_landmark_registry',
        offlineFallback: true,
        isInsideBBox: bboxCheck.isValid,
      };
    }
  }

  // 3. Fallback default (Shivajinagar Station)
  const defaultLm = landmarks[2] || landmarks[0];
  return {
    name: defaultLm.name,
    lat: defaultLm.lat,
    lon: defaultLm.lon,
    source: 'offline_landmark_registry',
    offlineFallback: true,
    isInsideBBox: true,
  };
}

/**
 * Robust asynchronous geocoder.
 * 1. Checks committed landmarks (instant, 0ms).
 * 2. Calls backend /api/geocode?q=... (local or Render server).
 * 3. Falls back to Nominatim OSM if backend is slow.
 * 4. Falls back to closest offline landmark.
 */
export async function geocodeLocation(
  query: string,
  apiBaseUrl: string = ''
): Promise<GeocodeResult> {
  const qClean = query.trim();
  if (!qClean) {
    return geocodeOffline('');
  }

  // Check if user input is explicit lat/lon coordinate format: "18.520, 73.856"
  const coordParts = qClean.split(',').map((p) => parseFloat(p.trim()));
  if (coordParts.length === 2 && !isNaN(coordParts[0]) && !isNaN(coordParts[1])) {
    const lat = coordParts[0];
    const lon = coordParts[1];
    const bbox = validateBBox(lat, lon);
    return {
      name: `Custom Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
      lat,
      lon,
      source: 'offline_landmark_registry',
      offlineFallback: false,
      isInsideBBox: bbox.isValid,
    };
  }

  // 1. Direct offline match
  const qLower = qClean.toLowerCase();
  const landmarks = landmarksData as Landmark[];
  const directMatch = landmarks.find(
    (lm) =>
      lm.name.toLowerCase() === qLower ||
      lm.aliases?.some((a) => a.toLowerCase() === qLower)
  );
  if (directMatch) {
    return {
      name: directMatch.name,
      lat: directMatch.lat,
      lon: directMatch.lon,
      source: 'offline_landmark_registry',
      offlineFallback: true,
      isInsideBBox: true,
    };
  }

  // 2. Query backend geocoder endpoint if base URL is available
  if (apiBaseUrl) {
    try {
      const url = `${apiBaseUrl.replace(/\/$/, '')}/api/geocode?q=${encodeURIComponent(qClean)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.lat === 'number' && typeof data.lon === 'number') {
          return {
            name: data.name || qClean,
            lat: data.lat,
            lon: data.lon,
            source: 'backend_geocoder',
            offlineFallback: Boolean(data.offline_fallback),
            isInsideBBox: validateBBox(data.lat, data.lon).isValid,
          };
        }
      }
    } catch (e) {
      // Backend request failed or timed out, fall through
    }
  }

  // 3. Query OpenStreetMap Nominatim directly
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      qClean + ', Pune, Maharashtra, India'
    )}&format=json&limit=1`;
    const res = await fetch(nominatimUrl, {
      headers: { 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const items = await res.json();
      if (items && items.length > 0) {
        const lat = parseFloat(items[0].lat);
        const lon = parseFloat(items[0].lon);
        return {
          name: items[0].display_name ? items[0].display_name.split(',')[0] + ', Pune' : qClean,
          lat,
          lon,
          source: 'nominatim_online',
          offlineFallback: false,
          isInsideBBox: validateBBox(lat, lon).isValid,
        };
      }
    }
  } catch (e) {
    // Nominatim unreachable / offline
  }

  // 4. Guaranteed offline fallback
  return geocodeOffline(qClean);
}
