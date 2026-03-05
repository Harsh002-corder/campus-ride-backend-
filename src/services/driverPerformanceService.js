import mongoose from "mongoose";
import { Ride, User } from "../models/index.js";
import { RIDE_STATUS } from "../constants/roles.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export async function recomputeDriverPerformance(driverId) {
  if (!driverId) return null;

  const objectId = new mongoose.Types.ObjectId(driverId);

  const [completedRides, acceptedOrOngoing, cancelledByDriver, avgRatingAgg, punctualAgg] = await Promise.all([
    Ride.countDocuments({ driverId: objectId, status: RIDE_STATUS.COMPLETED }),
    Ride.countDocuments({ driverId: objectId, status: { $in: [RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING, RIDE_STATUS.COMPLETED, RIDE_STATUS.CANCELLED] } }),
    Ride.countDocuments({ driverId: objectId, status: RIDE_STATUS.CANCELLED, cancelledBy: "driver" }),
    Ride.aggregate([
      { $match: { driverId: objectId, studentRating: { $ne: null } } },
      { $group: { _id: null, avgRating: { $avg: "$studentRating" } } },
    ]),
    Ride.aggregate([
      {
        $match: {
          driverId: objectId,
          status: RIDE_STATUS.COMPLETED,
          acceptedAt: { $ne: null },
          ongoingAt: { $ne: null },
        },
      },
      {
        $project: {
          deltaMinutes: {
            $divide: [{ $subtract: ["$ongoingAt", "$acceptedAt"] }, 60000],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgDeltaMinutes: { $avg: "$deltaMinutes" },
        },
      },
    ]),
  ]);

  const avgRating = Number(avgRatingAgg[0]?.avgRating || 4.2);
  const cancellationRate = acceptedOrOngoing > 0 ? cancelledByDriver / acceptedOrOngoing : 0;
  const avgStartDelay = Number(punctualAgg[0]?.avgDeltaMinutes || 10);

  const ratingComponent = (clamp(avgRating, 1, 5) / 5) * 40;
  const completionComponent = clamp(completedRides / 200, 0, 1) * 30;
  const cancellationComponent = (1 - clamp(cancellationRate, 0, 1)) * 20;
  const punctualityComponent = (1 - clamp(avgStartDelay / 30, 0, 1)) * 10;

  const score = Number((ratingComponent + completionComponent + cancellationComponent + punctualityComponent).toFixed(2));

  await User.updateOne(
    { _id: objectId },
    {
      $set: {
        driverPerformanceScore: score,
        driverStats: {
          avgRating: Number(avgRating.toFixed(2)),
          completedRides,
          cancellationRate: Number((cancellationRate * 100).toFixed(2)),
          avgStartDelayMinutes: Number(avgStartDelay.toFixed(2)),
          updatedAt: new Date(),
        },
        updatedAt: new Date(),
      },
    },
  );

  return score;
}
