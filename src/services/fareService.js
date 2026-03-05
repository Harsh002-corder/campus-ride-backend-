function toRadians(value) {
  return (value * Math.PI) / 180;
}

export function haversineDistanceKm(from, to) {
  if (!from || !to) return 0;

  const earthRadiusKm = 6371;
  const deltaLat = toRadians((to.lat || 0) - (from.lat || 0));
  const deltaLng = toRadians((to.lng || 0) - (from.lng || 0));

  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(from.lat || 0))
    * Math.cos(toRadians(to.lat || 0))
    * Math.sin(deltaLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function estimateRideFare({
  pickup,
  drop,
  activeRideCount = 0,
  onlineDriverCount = 1,
  baseFare = 20,
  perKmRate = 12,
  perMinuteRate = 1.5,
  minimumFare = 40,
}) {
  const distanceKm = haversineDistanceKm(pickup, drop);
  const estimatedDurationMinutes = Math.max(4, (distanceKm / 24) * 60);

  const demandRatio = activeRideCount / Math.max(onlineDriverCount, 1);
  const surgeMultiplier = clamp(1 + Math.max(0, demandRatio - 0.9) * 0.35, 1, 2.5);

  const distanceCharge = distanceKm * perKmRate;
  const timeCharge = estimatedDurationMinutes * perMinuteRate;
  const subtotal = baseFare + distanceCharge + timeCharge;
  const surgedTotal = subtotal * surgeMultiplier;
  const totalFare = Math.max(minimumFare, Math.round(surgedTotal));

  return {
    currency: "INR",
    baseFare: Number(baseFare.toFixed(2)),
    distanceKm: Number(distanceKm.toFixed(2)),
    estimatedDurationMinutes: Number(estimatedDurationMinutes.toFixed(1)),
    distanceCharge: Number(distanceCharge.toFixed(2)),
    timeCharge: Number(timeCharge.toFixed(2)),
    surgeMultiplier: Number(surgeMultiplier.toFixed(2)),
    subtotal: Number(subtotal.toFixed(2)),
    totalFare,
    generatedAt: new Date().toISOString(),
  };
}
