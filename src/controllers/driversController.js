import mongoose from "mongoose";
import { z } from "zod";
import { ROLES } from "../constants/roles.js";
import { User, Verification } from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { saveVerificationFile } from "../services/uploadService.js";
import { sendAccountStatusEmail } from "../utils/mailer.js";

export const setDriverOnlineSchema = z.object({
  online: z.boolean(),
});

export const setDriverLocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export const uploadVerificationSchema = z.object({
  docType: z.enum(["license", "id_proof", "vehicle_rc"]),
  fileDataUrl: z.string().min(20),
  fileName: z.string().min(1).max(120).optional(),
});

export const reviewVerificationSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewNotes: z.string().max(500).optional(),
});

export const setDriverOnline = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.DRIVER) {
    throw new AppError(403, "Only drivers can toggle online status");
  }

  const driverId = new mongoose.Types.ObjectId(req.user.id);
  const now = new Date();

  const updateResult = await User.findOneAndUpdate(
    { _id: driverId, role: ROLES.DRIVER },
    {
      $set: {
        isOnline: req.body.online,
        updatedAt: now,
      },
    },
    {
      new: true,
    },
  ).select("-passwordHash").lean();

  if (!updateResult) {
    throw new AppError(404, "Driver not found");
  }

  res.json({ user: serializeDriver(updateResult) });
});

export const listOnlineDrivers = asyncHandler(async (_req, res) => {
  const drivers = await User.find({
    role: ROLES.DRIVER,
    isOnline: true,
    driverApprovalStatus: "approved",
  })
    .select("-passwordHash")
    .sort({ updatedAt: -1 })
    .lean();

  res.json({ drivers: drivers.map(serializeDriver) });
});

export const setDriverLocation = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.DRIVER) {
    throw new AppError(403, "Only drivers can update location");
  }

  const driverId = new mongoose.Types.ObjectId(req.user.id);
  const now = new Date();

  const updated = await User.findOneAndUpdate(
    { _id: driverId, role: ROLES.DRIVER },
    {
      $set: {
        currentLocation: {
          lat: req.body.lat,
          lng: req.body.lng,
          updatedAt: now,
        },
        updatedAt: now,
      },
    },
    { new: true },
  ).select("-passwordHash").lean();

  if (!updated) {
    throw new AppError(404, "Driver not found");
  }

  res.json({ user: serializeDriver(updated) });
});

export const uploadVerificationDocument = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.DRIVER) {
    throw new AppError(403, "Only drivers can upload verification documents");
  }

  const uploaded = await saveVerificationFile({
    driverId: req.user.id,
    docType: req.body.docType,
    dataUrl: req.body.fileDataUrl,
    originalName: req.body.fileName,
  });

  const now = new Date();
  const verification = await Verification.findOneAndUpdate(
    { driverId: new mongoose.Types.ObjectId(req.user.id) },
    {
      $set: {
        status: "pending",
        reviewNotes: "",
        reviewedAt: null,
        reviewedBy: null,
        updatedAt: now,
      },
      $push: {
        documents: {
          type: req.body.docType,
          url: uploaded.url,
          fileName: uploaded.fileName,
          uploadedAt: now,
        },
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true, new: true, lean: true },
  );

  await User.updateOne(
    { _id: new mongoose.Types.ObjectId(req.user.id) },
    {
      $set: {
        driverApprovalStatus: "pending",
        driverVerificationStatus: "pending",
        updatedAt: now,
      },
    },
  );

  res.status(201).json({
    verification: {
      id: verification._id.toString(),
      status: verification.status,
      reviewNotes: verification.reviewNotes || "",
      documents: verification.documents || [],
      updatedAt: verification.updatedAt,
    },
  });
});

export const getMyVerificationStatus = asyncHandler(async (req, res) => {
  const verification = await Verification.findOne({
    driverId: new mongoose.Types.ObjectId(req.user.id),
  }).lean();

  res.json({
    verification: verification
      ? {
        id: verification._id.toString(),
        status: verification.status,
        reviewNotes: verification.reviewNotes || "",
        documents: verification.documents || [],
        reviewedAt: verification.reviewedAt,
        updatedAt: verification.updatedAt,
      }
      : null,
  });
});

export const listVerificationRequests = asyncHandler(async (_req, res) => {
  const rows = await Verification.find({}).sort({ updatedAt: -1 }).limit(200).lean();
  res.json({
    verifications: rows.map((item) => ({
      id: item._id.toString(),
      driverId: item.driverId?.toString() || null,
      status: item.status,
      reviewNotes: item.reviewNotes || "",
      documents: item.documents || [],
      reviewedAt: item.reviewedAt,
      updatedAt: item.updatedAt,
    })),
  });
});

export const reviewVerification = asyncHandler(async (req, res) => {
  const now = new Date();
  const verification = await Verification.findByIdAndUpdate(
    new mongoose.Types.ObjectId(req.params.verificationId),
    {
      $set: {
        status: req.body.status,
        reviewNotes: req.body.reviewNotes || "",
        reviewedBy: new mongoose.Types.ObjectId(req.user.id),
        reviewedAt: now,
        updatedAt: now,
      },
    },
    { new: true, lean: true },
  );

  if (!verification) {
    throw new AppError(404, "Verification request not found");
  }

  const approvalStatus = req.body.status === "approved" ? "approved" : "rejected";
  await User.updateOne(
    { _id: verification.driverId },
    {
      $set: {
        driverApprovalStatus: approvalStatus,
        driverVerificationStatus: approvalStatus,
        updatedAt: now,
      },
    },
  );

  const driver = await User.findById(verification.driverId).select("name email driverApprovalStatus driverVerificationStatus").lean();
  if (driver?.email) {
    await sendAccountStatusEmail({
      to: driver.email,
      name: driver.name,
      title: "CampusRide Driver Verification Update",
      message: `Your driver verification request has been ${approvalStatus}.`,
      details: [
        `Approval status: ${driver.driverApprovalStatus || approvalStatus}`,
        `Verification status: ${driver.driverVerificationStatus || approvalStatus}`,
        ...(req.body.reviewNotes ? [`Review note: ${req.body.reviewNotes}`] : []),
      ],
    }).catch(() => null);
  }

  res.json({
    verification: {
      id: verification._id.toString(),
      status: verification.status,
      reviewNotes: verification.reviewNotes || "",
      documents: verification.documents || [],
      reviewedAt: verification.reviewedAt,
      updatedAt: verification.updatedAt,
    },
  });
});

function serializeDriver(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    role: user.role,
    isOnline: Boolean(user.isOnline),
    driverApprovalStatus: user.driverApprovalStatus,
    currentLocation: user.currentLocation || null,
    ratingAverage: user.ratingAverage || user.rating || 4.5,
    seatsAvailable: user.seatsAvailable || user.vehicleSeats || 4,
    updatedAt: user.updatedAt,
  };
}