import cron from "node-cron";
import mongoose from "mongoose";
import { RIDE_STATUS } from "../constants/roles.js";
import { Ride, ScheduledRide } from "../models/index.js";
import { findBestDriverForRide } from "./matchingService.js";
import { emitNewRideRequest, emitRideUpdate } from "./socket.js";
import { createRideStatusNotifications } from "./notificationService.js";

let schedulerStarted = false;

async function activateScheduledRide(entry) {
  const now = new Date();
  const ride = await Ride.findById(entry.rideId).lean();
  if (!ride || ride.status !== RIDE_STATUS.SCHEDULED) {
    await ScheduledRide.updateOne({ _id: entry._id }, {
      $set: {
        status: "failed",
        errorMessage: "Scheduled ride not found or invalid state",
        lastAttemptAt: now,
        updatedAt: now,
      },
    });
    return;
  }

  const match = await findBestDriverForRide({
    pickup: ride.pickup,
    drop: ride.drop,
    passengers: ride.passengers || 1,
  });

  const bestDriverId = match.bestDriver?.driverId || null;

  const updatedRide = await Ride.findByIdAndUpdate(
    ride._id,
    {
      $set: {
        status: bestDriverId ? RIDE_STATUS.ACCEPTED : RIDE_STATUS.REQUESTED,
        driverId: bestDriverId ? new mongoose.Types.ObjectId(bestDriverId) : null,
        acceptedAt: bestDriverId ? now : null,
        requestedAt: ride.requestedAt || now,
        smartMatch: match,
        scheduleActivatedAt: now,
        updatedAt: now,
      },
    },
    { new: true, lean: true },
  );

  await ScheduledRide.updateOne(
    { _id: entry._id },
    {
      $set: {
        status: "activated",
        lastAttemptAt: now,
        updatedAt: now,
      },
    },
  );

  emitRideUpdate({
    id: updatedRide._id.toString(),
    studentId: updatedRide.studentId?.toString?.() || updatedRide.studentId,
    driverId: updatedRide.driverId?.toString?.() || updatedRide.driverId,
    status: updatedRide.status,
    pickup: updatedRide.pickup,
    drop: updatedRide.drop,
  });

  if (!bestDriverId) {
    emitNewRideRequest({
      id: updatedRide._id.toString(),
      studentId: updatedRide.studentId?.toString?.() || updatedRide.studentId,
      driverId: null,
      status: updatedRide.status,
      pickup: updatedRide.pickup,
      drop: updatedRide.drop,
    });
  }

  await createRideStatusNotifications({
    id: updatedRide._id.toString(),
    studentId: updatedRide.studentId?.toString?.() || updatedRide.studentId,
    driverId: updatedRide.driverId?.toString?.() || updatedRide.driverId,
    status: updatedRide.status,
  });
}

async function processDueScheduledRides() {
  const now = new Date();
  const due = await ScheduledRide.find({
    status: "pending",
    triggerAt: { $lte: now },
  })
    .sort({ triggerAt: 1 })
    .limit(20)
    .lean();

  for (const entry of due) {
    try {
      await activateScheduledRide(entry);
    } catch (error) {
      await ScheduledRide.updateOne(
        { _id: entry._id },
        {
          $set: {
            status: "failed",
            errorMessage: String(error?.message || "Unknown activation error"),
            lastAttemptAt: now,
            updatedAt: now,
          },
        },
      );
    }
  }
}

export function startScheduledRideProcessor() {
  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;
  cron.schedule("*/1 * * * *", () => {
    processDueScheduledRides().catch((error) => {
      console.error("Scheduled ride processor error", error);
    });
  });
}
