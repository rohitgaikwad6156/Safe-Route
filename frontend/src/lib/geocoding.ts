/**
 * SafeRoute AI: Offline-First Geocoding & Spatial Bounds Validation.
 * Guarantees zero-network resilience using committed landmarks,
 * live backend geocoding, and OpenStreetMap Nominatim.
 */
import landmarksData from '../mocks/landmarks.json';
import { Landmark } from '../types';

export const PUNE_BBOX = {
  minLat: 18.350,
  maxLat: 18.800,
  minLon: 73.650,
  maxLon: 74.100,
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
  source: 'offline_landmark_registry' | 'nominatim_online' | 'backend_geocoder' | 'not_found';
  offlineFallback: boolean;
  isInsideBBox: boolean;
  found: boolean; // false when geocoding failed to resolve the query to any real location
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

export function normalizeLocationText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchPuneLandmarks(query: string, limit: number = 6): Landmark[] {
  if (!query || query.trim().length === 0) {
    return (landmarksData as Landmark[]).slice(0, limit);
  }
  const qClean = query.trim();
  const qNorm = normalizeLocationText(qClean);
  const qWords = qNorm.split(' ').filter((w) => !['the', 'in', 'near', 'at'].includes(w));
  const landmarks = landmarksData as Landmark[];
  
  return landmarks.filter((item) => {
    const nameNorm = normalizeLocationText(item.name);
    const wardNorm = normalizeLocationText(item.ward || '');
    const aliasesNorm = (item.aliases || []).map((a) => normalizeLocationText(a));

    if (nameNorm.includes(qNorm) || wardNorm.includes(qNorm) || aliasesNorm.some((a) => a.includes(qNorm))) {
      return true;
    }
    if (qWords.length > 0 && qWords.every((w) => nameNorm.includes(w) || wardNorm.includes(w) || aliasesNorm.some((a) => a.includes(w)))) {
      return true;
    }
    return false;
  }).slice(0, limit);
}

export function geocodeOffline(query: string): GeocodeResult {
  const qClean = query.trim();
  const qNorm = normalizeLocationText(qClean);
  const qWords = qNorm.split(' ').filter((w) => !['the', 'in', 'near', 'at'].includes(w));
  const landmarks = landmarksData as Landmark[];

  // 1. Direct or alias normalized match
  for (const lm of landmarks) {
    const nameNorm = normalizeLocationText(lm.name);
    const aliasesNorm = (lm.aliases || []).map((a) => normalizeLocationText(a));
    if (nameNorm === qNorm || nameNorm.includes(qNorm) || aliasesNorm.some((a) => a === qNorm || a.includes(qNorm))) {
      const bboxCheck = validateBBox(lm.lat, lm.lon);
      return {
        name: lm.name,
        lat: lm.lat,
        lon: lm.lon,
        source: 'offline_landmark_registry',
        offlineFallback: true,
        isInsideBBox: bboxCheck.isValid,
        found: true,
      };
    }
  }

  // 2. Token match (all query words exist in landmark name or aliases)
  if (qWords.length > 0) {
    for (const lm of landmarks) {
      const nameNorm = normalizeLocationText(lm.name);
      const aliasesNorm = (lm.aliases || []).map((a) => normalizeLocationText(a));
      if (qWords.every((w) => nameNorm.includes(w) || aliasesNorm.some((a) => a.includes(w)))) {
        const bboxCheck = validateBBox(lm.lat, lm.lon);
        return {
          name: lm.name,
          lat: lm.lat,
          lon: lm.lon,
          source: 'offline_landmark_registry',
          offlineFallback: true,
          isInsideBBox: bboxCheck.isValid,
          found: true,
        };
      }
    }
  }

  // 3. Ward or partial match
  for (const lm of landmarks) {
    const wardNorm = normalizeLocationText(lm.ward || '');
    if (wardNorm && (wardNorm.includes(qNorm) || qNorm.includes(wardNorm))) {
      const bboxCheck = validateBBox(lm.lat, lm.lon);
      return {
        name: lm.name,
        lat: lm.lat,
        lon: lm.lon,
        source: 'offline_landmark_registry',
        offlineFallback: true,
        isInsideBBox: bboxCheck.isValid,
        found: true,
      };
    }
  }

  // Nothing matched — return a sentinel so callers can surface a proper "not found" error
  // instead of silently routing to a wrong location.
  return {
    name: qClean || 'Unknown Location',
    lat: 0,
    lon: 0,
    source: 'not_found',
    offlineFallback: false,
    isInsideBBox: false,
    found: false,
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
      found: true,
    };
  }

  // 1. Direct offline match with normalization
  const qNorm = normalizeLocationText(qClean);
  const qWords = qNorm.split(' ').filter((w) => !['the', 'in', 'near', 'at'].includes(w));
  const landmarks = landmarksData as Landmark[];
  const directMatch = landmarks.find((lm) => {
    const nameNorm = normalizeLocationText(lm.name);
    const aliasesNorm = (lm.aliases || []).map((a) => normalizeLocationText(a));
    if (nameNorm === qNorm || aliasesNorm.some((a) => a === qNorm)) return true;
    if (qWords.length > 0 && qWords.every((w) => nameNorm.includes(w) || aliasesNorm.some((a) => a.includes(w)))) return true;
    return false;
  });
  if (directMatch) {
    return {
      name: directMatch.name,
      lat: directMatch.lat,
      lon: directMatch.lon,
      source: 'offline_landmark_registry',
      offlineFallback: true,
      isInsideBBox: true,
      found: true,
    };
  }

  // 2. Query backend geocoder endpoint (always — backend uses Nominatim server-side)
  try {
    const backendBase = (apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? '' : 'http://127.0.0.1:8000')).replace(/\/$/, '');
    const url = `${backendBase}/api/geocode?q=${encodeURIComponent(qClean)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
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
          found: true,
        };
      }
    }
  } catch (e) {
    // Backend request failed or timed out, fall through to Nominatim
  }

  // 3. Query OpenStreetMap Nominatim directly
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      qClean + ', Pune, Maharashtra, India'
    )}&format=json&limit=1`;
    const res = await fetch(nominatimUrl, {
      headers: { 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(5000),
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
          found: true,
        };
      }
    }
  } catch (e) {
    // Nominatim unreachable / offline
  }

  // 4. Guaranteed offline fallback (partial/token match)
  const offlineResult = geocodeOffline(qClean);
  return offlineResult;
}
