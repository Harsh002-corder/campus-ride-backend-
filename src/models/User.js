import mongoose from "mongoose";
import { ALLOWED_ROLES } from "../constants/roles.js";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    email: { type: String, trim: true, lowercase: true, required: true },
    phone: { type: String, default: null },
    passwordHash: { type: String },
    role: { type: String, enum: ALLOWED_ROLES, required: true },
    isOnline: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    driverApprovalStatus: { type: String, enum: ["pending", "approved", "rejected"], default: "approved" },
    driverVerificationStatus: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    vehicleSeats: { type: Number, default: 4 },
    driverPerformanceScore: { type: Number, default: 60 },
    driverStats: { type: Object, default: {} },
    currentLocation: { type: Object, default: null },
    createdAt: { type: Date },
    updatedAt: { type: Date },
    lastLoginAt: { type: Date },
  },
  {
    collection: "users",
    strict: false,
    versionKey: false,
  },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, isOnline: 1 });

export const User = mongoose.models.User || mongoose.model("User", userSchema);