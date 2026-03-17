export const CAMPUS_BOUNDARY_POLYGON = [
  { lat: 28.828318, lng: 78.657056 },
  { lat: 28.825181, lng: 78.666301 },
  { lat: 28.822246, lng: 78.663600 },
  { lat: 28.822058, lng: 78.655897 },
  { lat: 28.824051, lng: 78.653022 },
  { lat: 28.828318, lng: 78.657056 },
];
const EARTH_RADIUS_METERS = 6371000;

function getCampusBounds(polygon = CAMPUS_BOUNDARY_POLYGON) {
  const latitudes = polygon.map((point) => point.lat);
  const longitudes = polygon.map((point) => point.lng);
  return {
    minLat: Math.min(...latitudes),
    maxLat: Math.max(...latitudes),
    minLng: Math.min(...longitudes),
    maxLng: Math.max(...longitudes),
  };
}

function isValidPoint(point) {
  return Boolean(
    point
    && typeof point.lat === "number"
    && Number.isFinite(point.lat)
    && typeof point.lng === "number"
    && Number.isFinite(point.lng),
  );
}

export function pointInPolygon(point, polygon = CAMPUS_BOUNDARY_POLYGON) {
  if (!isValidPoint(point) || !Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat;
    const yi = polygon[i].lng;
    const xj = polygon[j].lat;
    const yj = polygon[j].lng;

    const intersect = ((yi > point.lng) !== (yj > point.lng))
      && (point.lat < ((xj - xi) * (point.lng - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

export function isWithinCampusBoundary(point) {
  if (!isValidPoint(point)) return false;
  const bounds = getCampusBounds(CAMPUS_BOUNDARY_POLYGON);
  const insideBounds = point.lat >= bounds.minLat
    && point.lat <= bounds.maxLat
    && point.lng >= bounds.minLng
    && point.lng <= bounds.maxLng;
  return insideBounds && pointInPolygon(point, CAMPUS_BOUNDARY_POLYGON);
}

export function isInsideCampus(lat, lng) {
  return isWithinCampusBoundary({ lat, lng });
}

export function distanceInMeters(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}
