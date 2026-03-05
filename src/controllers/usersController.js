import mongoose from "mongoose";
import { z } from "zod";
import { ALLOWED_ROLES, ROLES } from "../constants/roles.js";
import { Favorite, User } from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendAccountDeletedEmail, sendAccountStatusEmail } from "../utils/mailer.js";

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().min(7).max(20).nullable().optional(),
  avatarUrl: z.string().max(2_000_000).nullable().optional(),
});

export const adminUpdateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().min(7).max(20).nullable().optional(),
  avatarUrl: z.string().max(2_000_000).nullable().optional(),
  role: z.enum(ALLOWED_ROLES).optional(),
  isActive: z.boolean().optional(),
  driverApprovalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
  driverVerificationStatus: z.enum(["pending", "approved", "rejected"]).optional(),
  vehicleSeats: z.number().int().min(1).max(10).optional(),
});

export const createFavoriteSchema = z.object({
  label: z.string().min(2).max(60),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string().max(140).optional(),
  }),
});

export const listUsers = asyncHandler(async (req, res) => {
  const role = req.query.role;
  const query = role ? { role } : {};

  const users = await User.find(query)
    .select("-passwordHash")
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  res.json({ users: users.map(serializeUser) });
});

export const getMyProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select("-passwordHash").lean();

  if (!user) {
    throw new AppError(404, "User not found");
  }

  res.json({ user: serializeUser(user) });
});

export const updateMyProfile = asyncHandler(async (req, res) => {
  await User.updateOne(
    { _id: new mongoose.Types.ObjectId(req.user.id) },
    {
      $set: {
        ...req.body,
        updatedAt: new Date(),
      },
    },
  );

  const updated = await User.findById(req.user.id).select("-passwordHash").lean();

  res.json({ user: serializeUser(updated) });
});

export const adminUpdateUser = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
    throw new AppError(400, "Invalid user ID");
  }
  const userId = new mongoose.Types.ObjectId(req.params.userId);

  const user = await User.findById(userId).lean();
  if (!user) {
    throw new AppError(404, "User not found");
  }

  if (user.role === ROLES.ADMIN && req.body.role && req.body.role !== ROLES.ADMIN) {
    throw new AppError(400, "Cannot downgrade an admin user");
  }

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        ...req.body,
        updatedAt: new Date(),
      },
    },
  );

  const updated = await User.findById(userId).select("-passwordHash").lean();

  const emailDispatch = [];
  const wasActive = user.isActive !== false;
  const nowActive = updated.isActive !== false;
  if (wasActive !== nowActive && updated.email) {
    emailDispatch.push(sendAccountStatusEmail({
      to: updated.email,
      name: updated.name,
      title: `CampusRide Account ${nowActive ? "Unblocked" : "Blocked"}`,
      message: nowActive
        ? "Your account has been reactivated by CampusRide admin."
        : "Your account has been blocked by CampusRide admin.",
      details: [
        `Account status: ${nowActive ? "Active" : "Blocked"}`,
      ],
    }));
  }

  if (user.driverApprovalStatus !== updated.driverApprovalStatus && updated.email) {
    const approvalState = updated.driverApprovalStatus || "pending";
    emailDispatch.push(sendAccountStatusEmail({
      to: updated.email,
      name: updated.name,
      title: "CampusRide Driver Approval Update",
      message: `Your driver account approval status is now: ${approvalState}.`,
      details: [
        `Approval status: ${approvalState}`,
        `Verification status: ${updated.driverVerificationStatus || "pending"}`,
      ],
    }));
  }

  await Promise.allSettled(emailDispatch);

  res.json({ user: serializeUser(updated) });
});

export const adminDeleteUser = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
    throw new AppError(400, "Invalid user ID");
  }

  const userId = new mongoose.Types.ObjectId(req.params.userId);
  const user = await User.findById(userId).lean();

  if (!user) {
    throw new AppError(404, "User not found");
  }

  if (user.role === ROLES.ADMIN) {
    throw new AppError(400, "Cannot delete an admin user");
  }

  if (user._id.toString() === req.user.id) {
    throw new AppError(400, "You cannot delete your own account");
  }

  await User.deleteOne({ _id: userId });

  if (user.email) {
    await sendAccountDeletedEmail({
      to: user.email,
      name: user.name,
    }).catch(() => null);
  }

  res.json({ ok: true, deletedUserId: user._id.toString() });
});

export const listMyFavorites = asyncHandler(async (req, res) => {
  const favorites = await Favorite.find({ userId: new mongoose.Types.ObjectId(req.user.id) })
    .sort({ updatedAt: -1 })
    .lean();

  res.json({
    favorites: favorites.map((favorite) => ({
      id: favorite._id.toString(),
      label: favorite.label,
      location: favorite.location,
      createdAt: favorite.createdAt,
      updatedAt: favorite.updatedAt,
    })),
  });
});

export const createFavorite = asyncHandler(async (req, res) => {
  const now = new Date();
  const favorite = await Favorite.findOneAndUpdate(
    {
      userId: new mongoose.Types.ObjectId(req.user.id),
      label: req.body.label.trim(),
    },
    {
      $set: {
        location: {
          lat: req.body.location.lat,
          lng: req.body.location.lng,
          address: req.body.location.address || "",
        },
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    {
      upsert: true,
      new: true,
      lean: true,
    },
  );

  res.status(201).json({
    favorite: {
      id: favorite._id.toString(),
      label: favorite.label,
      location: favorite.location,
      createdAt: favorite.createdAt,
      updatedAt: favorite.updatedAt,
    },
  });
});

export const deleteFavorite = asyncHandler(async (req, res) => {
  const result = await Favorite.findOneAndDelete({
    _id: new mongoose.Types.ObjectId(req.params.favoriteId),
    userId: new mongoose.Types.ObjectId(req.user.id),
  }).lean();

  if (!result) {
    throw new AppError(404, "Favorite location not found");
  }

  res.json({ ok: true });
});

function serializeUser(user) {
  if (!user) return null;
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    avatarUrl: user.avatarUrl || null,
    role: user.role,
    isOnline: Boolean(user.isOnline),
    isActive: user.isActive !== false,
    driverApprovalStatus: user.driverApprovalStatus || "approved",
    driverVerificationStatus: user.driverVerificationStatus || "pending",
    vehicleSeats: user.vehicleSeats || 4,
    driverPerformanceScore: user.driverPerformanceScore || 60,
    driverStats: user.driverStats || {},
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt || null,
  };
}