/**
 * Lightweight geo helpers — used instead of PostGIS at this scale.
 */

const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_DEG_LAT = 111_320;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two lat/lng points, in meters (Haversine).
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Conservative lat/lng bounding box around a point for a given radius.
 * Used as a cheap SQL prefilter before refining with {@link haversineMeters}.
 */
export function boundingBox(
  lat: number,
  lng: number,
  radiusM: number,
): BoundingBox {
  const latDelta = radiusM / METERS_PER_DEG_LAT;
  const cosLat = Math.cos(toRadians(lat));
  // Guard against division by ~0 near the poles.
  const lngDelta =
    radiusM / (METERS_PER_DEG_LAT * Math.max(Math.abs(cosLat), 1e-6));

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}
