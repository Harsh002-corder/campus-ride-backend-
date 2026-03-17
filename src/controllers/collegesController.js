import mongoose from "mongoose";
import { z } from "zod";
import { ROLES, SUPER_ADMIN_ROLES } from "../constants/roles.js";
import { College, User } from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const configSchema = z.object({
  baseFare: z.number().min(0).optional().nullable(),
  perKmRate: z.number().min(0).optional().nullable(),
  perMinuteRate: z.number().min(0).optional().nullable(),
  minimumFare: z.number().min(0).optional().nullable(),
  platformFeePercent: z.number().min(0).max(100).optional().nullable(),
  maxPassengers: z.number().int().min(1).max(10).optional().nullable(),
  matchingRadiusKm: z.number().min(0.2).max(100).optional().nullable(),
}).optional();

export const createCollegeSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(20),
  status: z.enum(["active", "inactive"]).optional(),
  location: z.object({
    lat: z.number().min(-90).max(90).optional().nullable(),
    lng: z.number().min(-180).max(180).optional().nullable(),
    address: z.string().max(240).optional(),
  }).optional(),
  boundaryPolygon: z.array(pointSchema).min(3).optional(),
  subAdminId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable(),
  config: configSchema,
});

export const updateCollegeSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  code: z.string().min(2).max(20).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  location: z.object({
    lat: z.number().min(-90).max(90).optional().nullable(),
    lng: z.number().min(-180).max(180).optional().nullable(),
    address: z.string().max(240).optional(),
  }).optional(),
  boundaryPolygon: z.array(pointSchema).min(3).optional(),
  subAdminId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional().nullable(),
  config: configSchema,
});

function isSuperAdminLike(role) {
  return SUPER_ADMIN_ROLES.includes(role);
}

function closePolygon(points) {
  if (!Array.isArray(points) || points.length < 3) return [];
  const normalized = points.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  if (first.lat !== last.lat || first.lng !== last.lng) {
    normalized.push({ ...first });
  }
  return normalized;
}

async function assertSubAdminUser(subAdminId) {
  if (!subAdminId) return;
  const user = await User.findById(subAdminId).select("_id role").lean();
  if (!user || user.role !== ROLES.SUB_ADMIN) {
    throw new AppError(400, "Assigned sub admin user is invalid");
  }
}

function serializeCollege(college) {
  return {
    id: college._id.toString(),
    name: college.name,
    code: college.code,
    status: college.status,
    location: college.location || null,
    boundaryPolygon: college.boundaryPolygon || [],
    subAdminId: college.subAdminId?.toString?.() || null,
    config: college.config || {},
    createdAt: college.createdAt,
    updatedAt: college.updatedAt,
  };
}

export const listPublicColleges = asyncHandler(async (_req, res) => {
  const colleges = await College.find({ status: "active" })
    .select("name code status location")
    .sort({ name: 1 })
    .lean();

  res.json({
    colleges: colleges.map((college) => ({
      id: college._id.toString(),
      name: college.name,
      code: college.code,
      status: college.status,
      location: college.location || null,
    })),
  });
});

export const listColleges = asyncHandler(async (req, res) => {
  const filter = isSuperAdminLike(req.user.role)
    ? {}
    : { subAdminId: new mongoose.Types.ObjectId(req.user.id) };

  const colleges = await College.find(filter)
    .sort({ updatedAt: -1 })
    .lean();

  res.json({ colleges: colleges.map(serializeCollege) });
});

export const getMyCollege = asyncHandler(async (req, res) => {
  const college = req.user.role === ROLES.SUB_ADMIN
    ? await College.findOne({ subAdminId: new mongoose.Types.ObjectId(req.user.id) }).lean()
    : (req.user.collegeId ? await College.findById(req.user.collegeId).lean() : null);
  if (!college) {
    return res.json({ college: null });
  }

  if (!isSuperAdminLike(req.user.role) && req.user.role === ROLES.SUB_ADMIN) {
    const assignedId = college.subAdminId?.toString?.() || null;
    if (assignedId !== req.user.id) {
      return res.json({ college: null });
    }
  }

  return res.json({ college: serializeCollege(college) });
});

export const createCollege = asyncHandler(async (req, res) => {
  if (!isSuperAdminLike(req.user.role)) {
    throw new AppError(403, "Only super admins can create colleges");
  }

  await assertSubAdminUser(req.body.subAdminId || null);

  const now = new Date();
  const college = await College.create({
    name: req.body.name.trim(),
    code: req.body.code.trim().toUpperCase(),
    status: req.body.status || "active",
    location: {
      lat: req.body.location?.lat ?? null,
      lng: req.body.location?.lng ?? null,
      address: req.body.location?.address || "",
    },
    boundaryPolygon: closePolygon(req.body.boundaryPolygon || []),
    subAdminId: req.body.subAdminId ? new mongoose.Types.ObjectId(req.body.subAdminId) : null,
    config: req.body.config || {},
    createdAt: now,
    updatedAt: now,
  });

  if (req.body.subAdminId) {
    await User.updateOne(
      { _id: new mongoose.Types.ObjectId(req.body.subAdminId) },
      { $set: { collegeId: college._id, updatedAt: now } },
    );
  }

  res.status(201).json({ college: serializeCollege(college) });
});

export const updateCollege = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.collegeId)) {
    throw new AppError(400, "Invalid college ID");
  }

  const collegeId = new mongoose.Types.ObjectId(req.params.collegeId);
  const current = await College.findById(collegeId).lean();
  if (!current) {
    throw new AppError(404, "College not found");
  }

  const isSuper = isSuperAdminLike(req.user.role);
  const isSubAdminOwner = req.user.role === ROLES.SUB_ADMIN && current.subAdminId?.toString?.() === req.user.id;
  if (!isSuper && !isSubAdminOwner) {
    throw new AppError(403, "Forbidden: college scope mismatch");
  }

  if (req.body.subAdminId !== undefined) {
    if (!isSuper) {
      throw new AppError(403, "Only super admins can change assigned sub admin");
    }
    await assertSubAdminUser(req.body.subAdminId || null);
  }

  const update = {
    updatedAt: new Date(),
  };

  if (req.body.name !== undefined) update.name = req.body.name.trim();
  if (req.body.code !== undefined) update.code = req.body.code.trim().toUpperCase();
  if (req.body.status !== undefined) update.status = req.body.status;
  if (req.body.location !== undefined) {
    update.location = {
      lat: req.body.location?.lat ?? null,
      lng: req.body.location?.lng ?? null,
      address: req.body.location?.address || "",
    };
  }
  if (req.body.boundaryPolygon !== undefined) {
    update.boundaryPolygon = closePolygon(req.body.boundaryPolygon);
  }
  if (req.body.config !== undefined) {
    update.config = {
      ...(current.config || {}),
      ...(req.body.config || {}),
    };
  }
  if (req.body.subAdminId !== undefined && isSuper) {
    update.subAdminId = req.body.subAdminId ? new mongoose.Types.ObjectId(req.body.subAdminId) : null;
  }

  await College.updateOne({ _id: collegeId }, { $set: update });

  if (req.body.subAdminId !== undefined && isSuper) {
    const now = new Date();
    await User.updateMany(
      { role: ROLES.SUB_ADMIN, collegeId },
      { $set: { collegeId: null, updatedAt: now } },
    );

    if (req.body.subAdminId) {
      await User.updateOne(
        { _id: new mongoose.Types.ObjectId(req.body.subAdminId) },
        { $set: { collegeId, updatedAt: now } },
      );
    }
  }

  const updated = await College.findById(collegeId).lean();
  res.json({ college: serializeCollege(updated) });
});
