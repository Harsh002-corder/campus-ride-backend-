import mongoose from "mongoose";
import { ROLES, RIDE_STATUS } from "../constants/roles.js";
import { Ride, User } from "../models/index.js";
import { haversineDistanceKm } from "./fareService.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeDistanceScore(distanceKm) {
  return clamp(1 - distanceKm / 20, 0, 1);
}

function normalizeRatingScore(rating) {
  return clamp((Number(rating) || 0) / 5, 0, 1);
}

function normalizeSeatScore(seatsAvailable, requiredPassengers) {
  const seats = Number(seatsAvailable) || 0;
  if (seats < requiredPassengers) return 0;
  if (seats === requiredPassengers) return 1;
  return clamp(requiredPassengers / seats + 0.25, 0, 1);
}

function routeSimilarityScore(candidate, request) {
  const candidatePickup = candidate.preferredRoute?.pickup;
  const candidateDrop = candidate.preferredRoute?.drop;
  if (!candidatePickup || !candidateDrop) {
    // No preferred route set — moderate penalty (was 0.55, now lower)
    return 0.35;
  }

  const pickupDelta = haversineDistanceKm(candidatePickup, request.pickup);
  const dropDelta = haversineDistanceKm(candidateDrop, request.drop);
  const routeDelta = (pickupDelta + dropDelta) / 2;
  return clamp(1 - routeDelta / 15, 0, 1);
}

function normalizeStartDelayScore(avgStartDelayMinutes) {
  // Lower delay = higher score: 0 min → 1.0, 15 min → 0.5, 30+ min → 0.0
  const delay = Number(avgStartDelayMinutes) || 10;
  return clamp(1 - delay / 30, 0, 1);
}

function normalizeCancellationRateScore(cancellationRatePct) {
  // 0% cancellation → 1.0, 50%+ → 0.0
  const rate = Number(cancellationRatePct) || 0;
  return clamp(1 - rate / 50, 0, 1);
}

function normalizePerformanceScore(score) {
  return clamp((Number(score) || 0) / 100, 0, 1);
}

function readDriverLocation(driver) {
  if (
    driver.currentLocationGeo
    && Array.isArray(driver.currentLocationGeo.coordinates)
    && driver.currentLocationGeo.coordinates.length >= 2
  ) {
    const [lng, lat] = driver.currentLocationGeo.coordinates;
    if (typeof lat === "number" && typeof lng === "number") {
      return { lat, lng };
    }
  }

  const location = driver.currentLocation || driver.location || null;
  if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
    return null;
  }
  return { lat: location.lat, lng: location.lng };
}

function calculateCompositeScore(input, options = {}) {
  const { passengers = 1, isScheduled = false, hasRouteData = false } = options;

  // Dynamic weights based on context
  let distanceW    = isScheduled ? 0.25 : 0.38; // location matters less for future rides
  let ratingW      = 0.15;
  let seatW        = passengers > 2 ? 0.20 : 0.12; // more important with larger groups
  let routeW       = hasRouteData ? 0.18 : 0.08;   // only weight heavily when data exists
  let performanceW = 0.10;
  let punctualityW = isScheduled ? 0.10 : 0.05;    // punctuality critical for scheduled rides
  let cancelW      = 0.08;

  // Normalize to sum exactly to 1.0
  const total = distanceW + ratingW + seatW + routeW + performanceW + punctualityW + cancelW;
  distanceW    /= total;
  ratingW      /= total;
  seatW        /= total;
  routeW       /= total;
  performanceW /= total;
  punctualityW /= total;
  cancelW      /= total;

  const weighted = (input.distanceScore    * distanceW)
    + (input.ratingScore      * ratingW)
    + (input.seatScore        * seatW)
    + (input.routeScore       * routeW)
    + (input.performanceScore * performanceW)
    + (input.punctualityScore * punctualityW)
    + (input.cancellationScore * cancelW);

  return Number((weighted * 100).toFixed(2));
}

function scoreDrivers(drivers, blockedSet, { pickup, drop, passengers, matchingRadiusKm, isScheduled = false }) {
  const withRouteData = drivers.filter((d) => d.preferredRoute?.pickup && d.preferredRoute?.drop).length;
  const hasRouteData = withRouteData > Math.max(1, drivers.length * 0.3);

  return drivers
    .filter((driver) => !blockedSet.has(driver._id.toString()))
    .map((driver) => {
      const location = readDriverLocation(driver);
      const distanceKm = location ? haversineDistanceKm(location, pickup) : 50;
      const rating = Number(driver.ratingAverage ?? driver.rating ?? 4.2);
      const seatsAvailable = Number(driver.seatsAvailable ?? driver.vehicleSeats ?? 4);
      const performanceScore = normalizePerformanceScore(driver.driverPerformanceScore ?? 60);

      // Pull real-world performance stats if available
      const stats = driver.driverStats || {};
      const avgStartDelayMinutes = Number(stats.avgStartDelayMinutes ?? 10);
      const cancellationRatePct  = Number(stats.cancellationRate ?? 0);

      const distanceScore     = normalizeDistanceScore(distanceKm);
      const ratingScore       = normalizeRatingScore(rating);
      const seatScore         = normalizeSeatScore(seatsAvailable, passengers);
      const routeScore        = routeSimilarityScore(driver, { pickup, drop });
      const punctualityScore  = normalizeStartDelayScore(avgStartDelayMinutes);
      const cancellationScore = normalizeCancellationRateScore(cancellationRatePct);

      const matchScore = calculateCompositeScore(
        { distanceScore, ratingScore, seatScore, routeScore, performanceScore, punctualityScore, cancellationScore },
        { passengers, isScheduled, hasRouteData },
      );

      return {
        driverId: driver._id.toString(),
        name: driver.name,
        phone: driver.phone || null,
        email: driver.email || null,
        location,
        distanceKm: Number(distanceKm.toFixed(2)),
        seatsAvailable,
        rating: Number(rating.toFixed(2)),
        scores: {
          distanceScore:     Number((distanceScore * 100).toFixed(2)),
          ratingScore:       Number((ratingScore * 100).toFixed(2)),
          seatScore:         Number((seatScore * 100).toFixed(2)),
          routeScore:        Number((routeScore * 100).toFixed(2)),
          performanceScore:  Number((performanceScore * 100).toFixed(2)),
          punctualityScore:  Number((punctualityScore * 100).toFixed(2)),
          cancellationScore: Number((cancellationScore * 100).toFixed(2)),
          matchScore,
        },
      };
    })
    .filter((driver) => driver.scores.seatScore > 0)
    .filter((driver) => {
      if (!matchingRadiusKm || !Number.isFinite(Number(matchingRadiusKm))) return true;
      return driver.distanceKm <= Number(matchingRadiusKm);
    })
    .sort((a, b) => {
      const diff = b.scores.matchScore - a.scores.matchScore;
      // Within 3 points, prefer the geographically closer driver
      if (Math.abs(diff) < 3) return a.distanceKm - b.distanceKm;
      return diff;
    });
}

function buildDriverQuery({ collegeId }) {
  return {
    role: ROLES.DRIVER,
    ...(collegeId ? { collegeId: toObjectId(collegeId) } : {}),
    isOnline: true,
    driverApprovalStatus: "approved",
    driverVerificationStatus: { $in: ["approved", null] },
  };
}

async function findGeoNearbyDrivers({ pickup, collegeId, matchingRadiusKm, selectFields }) {
  if (!matchingRadiusKm || !Number.isFinite(Number(matchingRadiusKm))) {
    return [];
  }

  const baseRadius = Math.max(0.2, Number(matchingRadiusKm));
  const radiusSteps = [baseRadius, Math.min(baseRadius * 1.8, 25), Math.min(baseRadius * 3, 35)];
  const dedupe = new Map();

  for (const radiusKm of radiusSteps) {
    const maxDistance = Math.round(radiusKm * 1000);

    const rows = await User.find({
      ...buildDriverQuery({ collegeId }),
      currentLocationGeo: {
        $near: {
          $geometry: { type: "Point", coordinates: [pickup.lng, pickup.lat] },
          $maxDistance: maxDistance,
        },
      },
    })
      .select(selectFields)
      .limit(40)
      .lean();

    for (const row of rows) {
      dedupe.set(row._id.toString(), row);
    }

    if (dedupe.size >= 10) {
      break;
    }
  }

  return Array.from(dedupe.values());
}

export async function findBestDriverForRide({ pickup, drop, passengers = 1, collegeId = null, matchingRadiusKm = null, isScheduled = false }) {
  const busyDriverIds = await Ride.find({ status: { $in: [RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING] }, driverId: { $ne: null } })
    .distinct("driverId");

  const blockedSet = new Set(busyDriverIds.map((id) => id.toString()));

  const selectFields = "name phone email currentLocation currentLocationGeo location rating ratingAverage seatsAvailable vehicleSeats preferredRoute driverPerformanceScore driverStats";
  let availableDrivers = [];

  try {
    availableDrivers = await findGeoNearbyDrivers({ pickup, collegeId, matchingRadiusKm, selectFields });
  } catch {
    availableDrivers = [];
  }

  if (availableDrivers.length === 0) {
    availableDrivers = await User.find(buildDriverQuery({ collegeId }))
      .select(selectFields)
      .lean();
  }

  const scored = scoreDrivers(availableDrivers, blockedSet, {
    pickup,
    drop,
    passengers,
    matchingRadiusKm,
    isScheduled,
  });

  return {
    bestDriver: scored[0] || null,
    candidates: scored.slice(0, 5),
    totalCandidates: scored.length,
  };
}

export function toObjectId(id) {
  return new mongoose.Types.ObjectId(id);
}
