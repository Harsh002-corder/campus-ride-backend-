export const CAMPUS_BOUNDARY_POLYGON = [
  { lat: 28.835700, lng: 78.689900 },
  { lat: 28.835300, lng: 78.694500 },
  { lat: 28.835000, lng: 78.698500 },
  { lat: 28.833800, lng: 78.701200 },
  { lat: 28.831200, lng: 78.701400 },
  { lat: 28.828900, lng: 78.700500 },
  { lat: 28.827500, lng: 78.698300 },
  { lat: 28.826900, lng: 78.695900 },
  { lat: 28.827200, lng: 78.693000 },
  { lat: 28.828500, lng: 78.690900 },
  { lat: 28.830500, lng: 78.689900 },
  { lat: 28.833200, lng: 78.689500 },
  { lat: 28.835700, lng: 78.689900 },
];

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
  return pointInPolygon(point, CAMPUS_BOUNDARY_POLYGON);
}
