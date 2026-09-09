import { RouteData } from '../types';
import { LiveCoordinates } from './geolocation';

export interface RouteProgressSnapshot {
  progressPercentage: number;
  distanceTravelledMeters: number;
  remainingDistanceMeters: number;
  remainingDurationSeconds: number;
  distanceFromRouteMeters: number | null;
  nearestRoutePoint: [number, number] | null;
  nearestSegmentIndex: number | null;
}

export interface PreparedRouteGeometry {
  coordinates: [number, number][];
  segmentLengthsMeters: number[];
  cumulativeDistancesMeters: number[];
  totalGeometryDistanceMeters: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(value: number): number {
  return value * Math.PI / 180;
}

export function haversineDistanceMeters(
  first: [number, number],
  second: [number, number],
): number {
  const [firstLon, firstLat] = first;
  const [secondLon, secondLat] = second;
  const latDelta = toRadians(secondLat - firstLat);
  const lonDelta = toRadians(secondLon - firstLon);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(toRadians(firstLat)) * Math.cos(toRadians(secondLat)) * Math.sin(lonDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

function projectOntoSegment(
  point: [number, number],
  start: [number, number],
  end: [number, number],
): { fraction: number; distanceMeters: number; coordinate: [number, number] } {
  const referenceLat = toRadians((start[1] + end[1] + point[1]) / 3);
  const scaleX = Math.cos(referenceLat) * Math.PI * EARTH_RADIUS_METERS / 180;
  const scaleY = Math.PI * EARTH_RADIUS_METERS / 180;
  const segmentX = (end[0] - start[0]) * scaleX;
  const segmentY = (end[1] - start[1]) * scaleY;
  const pointX = (point[0] - start[0]) * scaleX;
  const pointY = (point[1] - start[1]) * scaleY;
  const squaredLength = segmentX ** 2 + segmentY ** 2;
  const fraction = squaredLength === 0
    ? 0
    : Math.max(0, Math.min(1, (pointX * segmentX + pointY * segmentY) / squaredLength));
  const offsetX = pointX - fraction * segmentX;
  const offsetY = pointY - fraction * segmentY;
  return {
    fraction,
    distanceMeters: Math.hypot(offsetX, offsetY),
    coordinate: [
      start[0] + (end[0] - start[0]) * fraction,
      start[1] + (end[1] - start[1]) * fraction,
    ],
  };
}

/**
 * Precomputes the route-only values that do not change between GPS updates.
 * Navigation creates this once per selected route so each subsequent update only
 * performs the nearest-segment scan.
 */
export function prepareRouteGeometry(route: RouteData): PreparedRouteGeometry {
  const coordinates = route.geometry.coordinates;
  const segmentLengthsMeters: number[] = [];
  const cumulativeDistancesMeters: number[] = [0];
  let totalGeometryDistanceMeters = 0;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const segmentLength = haversineDistanceMeters(coordinates[index], coordinates[index + 1]);
    segmentLengthsMeters.push(segmentLength);
    totalGeometryDistanceMeters += segmentLength;
    cumulativeDistancesMeters.push(totalGeometryDistanceMeters);
  }

  return {
    coordinates,
    segmentLengthsMeters,
    cumulativeDistancesMeters,
    totalGeometryDistanceMeters,
  };
}

export function calculateRouteProgress(
  route: RouteData,
  location: LiveCoordinates | null,
  preparedGeometry: PreparedRouteGeometry = prepareRouteGeometry(route),
): RouteProgressSnapshot {
  const {
    coordinates,
    segmentLengthsMeters,
    cumulativeDistancesMeters,
    totalGeometryDistanceMeters,
  } = preparedGeometry;
  if (!location || coordinates.length < 2) {
    return {
      progressPercentage: 0,
      distanceTravelledMeters: 0,
      remainingDistanceMeters: route.distance_meters,
      remainingDurationSeconds: route.duration_seconds,
      distanceFromRouteMeters: null,
      nearestRoutePoint: null,
      nearestSegmentIndex: null,
    };
  }

  const point: [number, number] = [location.longitude, location.latitude];
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestTraversed = 0;
  let nearestRoutePoint: [number, number] | null = null;
  let nearestSegmentIndex: number | null = null;

  for (let index = 0; index < segmentLengthsMeters.length; index += 1) {
    const projection = projectOntoSegment(point, coordinates[index], coordinates[index + 1]);
    if (projection.distanceMeters < nearestDistance) {
      nearestDistance = projection.distanceMeters;
      nearestTraversed = cumulativeDistancesMeters[index] + segmentLengthsMeters[index] * projection.fraction;
      nearestRoutePoint = projection.coordinate;
      nearestSegmentIndex = index;
    }
  }

  const progressRatio = totalGeometryDistanceMeters > 0
    ? Math.max(0, Math.min(1, nearestTraversed / totalGeometryDistanceMeters))
    : 0;
  return {
    progressPercentage: progressRatio * 100,
    distanceTravelledMeters: Math.max(0, route.distance_meters * progressRatio),
    remainingDistanceMeters: Math.max(0, route.distance_meters * (1 - progressRatio)),
    remainingDurationSeconds: Math.max(0, route.duration_seconds * (1 - progressRatio)),
    distanceFromRouteMeters: Number.isFinite(nearestDistance) ? nearestDistance : null,
    nearestRoutePoint,
    nearestSegmentIndex,
  };
}
