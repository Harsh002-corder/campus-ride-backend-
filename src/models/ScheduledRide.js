import mongoose from "mongoose";

const scheduledRideSchema = new mongoose.Schema(
  {
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", required: true, unique: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    triggerAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ["pending", "activated", "cancelled", "failed"], default: "pending" },
    lastAttemptAt: { type: Date, default: null },
    errorMessage: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "scheduled_rides",
    versionKey: false,
  },
);

scheduledRideSchema.index({ status: 1, triggerAt: 1 });

export const ScheduledRide = mongoose.models.ScheduledRide || mongoose.model("ScheduledRide", scheduledRideSchema);
