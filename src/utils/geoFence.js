export const CAMPUS_BOUNDARY_POLYGON = [
  { lat: 28.8358, lng: 78.6895 },
  { lat: 28.8350, lng: 78.6935 },
  { lat: 28.8342, lng: 78.6978 },
  { lat: 28.8329, lng: 78.7008 },
  { lat: 28.8310, lng: 78.7015 },
  { lat: 28.8292, lng: 78.7005 },
  { lat: 28.8278, lng: 78.6987 },
  { lat: 28.8270, lng: 78.6965 },
  { lat: 28.8272, lng: 78.6940 },
  { lat: 28.8282, lng: 78.6918 },
  { lat: 28.8298, lng: 78.6902 },
  { lat: 28.8315, lng: 78.6893 },
  { lat: 28.8335, lng: 78.6892 },
  { lat: 28.8358, lng: 78.6895 },
];

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
