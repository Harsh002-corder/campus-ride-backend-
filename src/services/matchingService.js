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
    return 0.55;
  }

  const pickupDelta = haversineDistanceKm(candidatePickup, request.pickup);
  const dropDelta = haversineDistanceKm(candidateDrop, request.drop);
  const routeDelta = (pickupDelta + dropDelta) / 2;
  return clamp(1 - routeDelta / 15, 0, 1);
}

function normalizePerformanceScore(score) {
  return clamp((Number(score) || 0) / 100, 0, 1);
}

function readDriverLocation(driver) {
  const location = driver.currentLocation || driver.location || null;
  if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
    return null;
  }
  return { lat: location.lat, lng: location.lng };
}

function calculateCompositeScore(input) {
  const weighted = (input.distanceScore * 0.4)
    + (input.ratingScore * 0.2)
    + (input.seatScore * 0.15)
    + (input.routeScore * 0.15)
    + (input.performanceScore * 0.1);

  return Number((weighted * 100).toFixed(2));
}

export async function findBestDriverForRide({ pickup, drop, passengers = 1 }) {
  const busyDriverIds = await Ride.find({ status: { $in: [RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING] }, driverId: { $ne: null } })
    .distinct("driverId");

  const blockedSet = new Set(busyDriverIds.map((id) => id.toString()));

  const availableDrivers = await User.find({
    role: ROLES.DRIVER,
    isOnline: true,
    driverApprovalStatus: "approved",
    driverVerificationStatus: { $in: ["approved", null] },
  })
    .select("name phone email currentLocation location rating ratingAverage seatsAvailable vehicleSeats preferredRoute driverPerformanceScore")
    .lean();

  const scored = availableDrivers
    .filter((driver) => !blockedSet.has(driver._id.toString()))
    .map((driver) => {
      const location = readDriverLocation(driver);
      const distanceKm = location ? haversineDistanceKm(location, pickup) : 50;
      const rating = Number(driver.ratingAverage ?? driver.rating ?? 4.2);
      const seatsAvailable = Number(driver.seatsAvailable ?? driver.vehicleSeats ?? 4);
      const performanceScore = normalizePerformanceScore(driver.driverPerformanceScore ?? 60);

      const distanceScore = normalizeDistanceScore(distanceKm);
      const ratingScore = normalizeRatingScore(rating);
      const seatScore = normalizeSeatScore(seatsAvailable, passengers);
      const routeScore = routeSimilarityScore(driver, { pickup, drop });
      const matchScore = calculateCompositeScore({ distanceScore, ratingScore, seatScore, routeScore, performanceScore });

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
          distanceScore: Number((distanceScore * 100).toFixed(2)),
          ratingScore: Number((ratingScore * 100).toFixed(2)),
          seatScore: Number((seatScore * 100).toFixed(2)),
          routeScore: Number((routeScore * 100).toFixed(2)),
          performanceScore: Number((performanceScore * 100).toFixed(2)),
          matchScore,
        },
      };
    })
    .filter((driver) => driver.scores.seatScore > 0)
    .sort((a, b) => b.scores.matchScore - a.scores.matchScore);

  return {
    bestDriver: scored[0] || null,
    candidates: scored.slice(0, 5),
    totalCandidates: scored.length,
  };
}

export function toObjectId(id) {
  return new mongoose.Types.ObjectId(id);
}
