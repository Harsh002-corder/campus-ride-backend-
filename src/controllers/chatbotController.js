import mongoose from "mongoose";
import { Ride } from "../models/index.js";
import { ROLES, RIDE_STATUS } from "../constants/roles.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { buildJarviouFallbackResponse, detectJarviouIntent } from "../services/chatbotService.js";

export const sendJarviouMessage = asyncHandler(async (req, res) => {
  const message = String(req.body.message || "").trim();
  const intent = detectJarviouIntent(message);

  if (intent.type === "ride_status") {
    const query = req.user.role === ROLES.DRIVER
      ? { driverId: new mongoose.Types.ObjectId(req.user.id) }
      : { studentId: new mongoose.Types.ObjectId(req.user.id) };

    const latestRide = await Ride.findOne(query).sort({ createdAt: -1 }).lean();

    if (!latestRide) {
      return res.json({
        assistant: "I could not find any rides yet. You can book one from your dashboard.",
        intent,
      });
    }

    return res.json({
      assistant: `Your latest ride is ${latestRide.status}. Pickup: ${latestRide.pickup?.label || "N/A"}, Drop: ${latestRide.drop?.label || "N/A"}.`,
      intent,
      data: {
        rideId: latestRide._id.toString(),
        status: latestRide.status,
      },
    });
  }

  if (intent.type === "cancel_ride") {
    const query = req.user.role === ROLES.DRIVER
      ? {
        driverId: new mongoose.Types.ObjectId(req.user.id),
        status: { $in: [RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING] },
      }
      : {
        studentId: new mongoose.Types.ObjectId(req.user.id),
        status: { $in: [RIDE_STATUS.REQUESTED, RIDE_STATUS.ACCEPTED] },
      };

    const ride = await Ride.findOneAndUpdate(
      query,
      {
        $set: {
          status: RIDE_STATUS.CANCELLED,
          cancelReason: "Cancelled via Jarviou",
          cancelledBy: req.user.role,
          cancelledAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { new: true, lean: true },
    );

    if (!ride) {
      return res.json({ assistant: "No cancellable ride found right now.", intent });
    }

    return res.json({
      assistant: `Ride ${ride._id.toString()} cancelled successfully.`,
      intent,
      data: { rideId: ride._id.toString(), status: ride.status },
    });
  }

  return res.json({
    assistant: buildJarviouFallbackResponse(intent),
    intent,
  });
});
