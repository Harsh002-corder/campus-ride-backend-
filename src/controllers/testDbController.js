import { z } from "zod";
import { env } from "../config/env.js";
import { Ride, User } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/AppError.js";

export const testCreateUserSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().transform((value) => value.toLowerCase().trim()),
  role: z.enum(["student", "driver", "admin"]).default("student"),
  phone: z.string().min(7).max(20).optional(),
});

function ensureNotProduction() {
  if (env.nodeEnv === "production") {
    throw new AppError(403, "Test DB routes are disabled in production");
  }
}

export const testCreateUser = asyncHandler(async (req, res) => {
  ensureNotProduction();

  const now = new Date();
  const user = await User.create({
    name: req.body.name,
    email: req.body.email,
    role: req.body.role,
    phone: req.body.phone || null,
    isOnline: false,
    isActive: true,
    driverApprovalStatus: req.body.role === "driver" ? "pending" : "approved",
    createdAt: now,
    updatedAt: now,
  });

  res.status(201).json({
    message: "Test user created",
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
  });
});

export const testFetchRides = asyncHandler(async (req, res) => {
  ensureNotProduction();

  const limit = Math.min(Number(req.query.limit || 20), 100);
  const rides = await Ride.find({}).sort({ createdAt: -1 }).limit(limit).lean();

  res.json({
    count: rides.length,
    rides: rides.map((ride) => ({
      id: ride._id.toString(),
      studentId: ride.studentId?.toString() || null,
      driverId: ride.driverId?.toString() || null,
      status: ride.status,
      verificationCode: ride.verificationCode,
      createdAt: ride.createdAt,
    })),
  });
});
