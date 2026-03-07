import mongoose from "mongoose";
import { RIDE_STATUS } from "../constants/roles.js";

const pointSchema = new mongoose.Schema(
  {
    lat: { type: Number },
    lng: { type: Number },
    label: { type: String },
    updatedAt: { type: Date },
  },
  { _id: false, strict: false },
);

const rideSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    pickup: { type: pointSchema, required: true },
    drop: { type: pointSchema, required: true },
    status: { type: String, enum: Object.values(RIDE_STATUS), default: RIDE_STATUS.REQUESTED, required: true },
    passengerNames: { type: [String], default: [] },
    isGroupRide: { type: Boolean, default: false },
    scheduledFor: { type: Date, default: null },
    scheduleActivatedAt: { type: Date, default: null },
    verificationCode: { type: String, required: true },
    sharedLinkToken: { type: String, default: null },
    sharedLinkExpiresAt: { type: Date, default: null },
    deniedDriverIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    cancelReason: { type: String, default: null },
    cancelledBy: { type: String, default: null },
    driverLocation: { type: pointSchema, default: null },
    studentLocation: { type: pointSchema, default: null },
    requestedAt: { type: Date },
    acceptedAt: { type: Date, default: null },
    ongoingAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  {
    collection: "rides",
    strict: false,
    versionKey: false,
  },
);

rideSchema.index({ studentId: 1, createdAt: -1 });
rideSchema.index({ driverId: 1, createdAt: -1 });
rideSchema.index({ status: 1, createdAt: -1 });
rideSchema.index({ verificationCode: 1, status: 1 });
rideSchema.index({ sharedLinkToken: 1 }, { unique: true, sparse: true });

export const Ride = mongoose.models.Ride || mongoose.model("Ride", rideSchema);