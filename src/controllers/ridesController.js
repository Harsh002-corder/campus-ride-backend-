import mongoose from "mongoose";
import crypto from "crypto";
import { z } from "zod";
import { env } from "../config/env.js";
import { RIDE_STATUS, ROLES, ADMIN_DASHBOARD_ROLES } from "../constants/roles.js";
import { Cancellation, College, EmailLog, Payment, Rating, Ride, ScheduledRide, Setting, User } from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { generateUniqueRideCode } from "../utils/rideCode.js";
import { emitNewRideRequest, emitRideUpdate } from "../services/socket.js";
import { findBestDriverForRide } from "../services/matchingService.js";
import { estimateRideFare } from "../services/fareService.js";
import { createRideStatusNotifications } from "../services/notificationService.js";
import { generateRideInvoiceBuffer } from "../services/pdfInvoiceService.js";
import { recomputeDriverPerformance } from "../services/driverPerformanceService.js";
import { CAMPUS_BOUNDARY_POLYGON, distanceInMeters, pointInPolygon } from "../utils/geoFence.js";
import { sendRideInvoiceEmail } from "../utils/mailer.js";

const CANCELLATION_REASONS = {
  driver_delayed: "Driver delayed",
  change_of_plans: "Change of plans",
  emergency: "Emergency",
  wrong_booking: "Wrong booking",
  personal_reason: "Personal reason",
  other: "Other",
};

const RIDE_SETTING_KEYS = {
  bookingEnabled: "ride_booking_enabled",
  maxPassengers: "ride_max_passengers",
  cancellationWindowMinutes: "ride_cancellation_window_minutes",
  locationSyncIntervalSeconds: "ride_location_sync_interval_seconds",
  supportPhone: "ride_support_phone",
  baseFare: "ride_base_fare",
  perKmRate: "ride_per_km_rate",
  perMinuteRate: "ride_per_minute_rate",
  minimumFare: "ride_minimum_fare",
  platformFeePercent: "ride_platform_fee_percent",
  pickupDropStops: "ride_pickup_drop_stops",
  campusBoundaryPolygon: "ride_campus_boundary_polygon",
};

const DEFAULT_RIDE_SETTINGS = {
  bookingEnabled: true,
  maxPassengers: 4,
  cancellationWindowMinutes: 10,
  locationSyncIntervalSeconds: 5,
  supportPhone: "+91 90000 00000",
  baseFare: 20,
  perKmRate: 12,
  perMinuteRate: 1.5,
  minimumFare: 40,
  platformFeePercent: 0,
  pickupDropStops: [],
  campusBoundaryPolygon: CAMPUS_BOUNDARY_POLYGON,
  matchingRadiusKm: 8,
};

const DEFAULT_SHARE_LINK_TTL_MS = 1000 * 60 * 60 * 24;
const REQUESTED_LIKE_STATUSES = [RIDE_STATUS.REQUESTED, "requested"];
const ONGOING_LIKE_STATUSES = [RIDE_STATUS.ONGOING, "ongoing"];
// TODO: set back to true before going live
const ENFORCE_CAMPUS_BOUNDARY = true;
const MAX_PICKUP_GPS_DISTANCE_METERS = 200;
const COARSE_GPS_ACCURACY_THRESHOLD_METERS = 1200;

function isRequestedLikeStatus(status) {
  return REQUESTED_LIKE_STATUSES.includes(status);
}

function isOngoingLikeStatus(status) {
  return ONGOING_LIKE_STATUSES.includes(status);
}

function generateShareTrackingToken() {
  return crypto.randomBytes(24).toString("hex");
}

function getShareTrackingUrl(token) {
  if (!token) return null;
  const base = env.clientOrigin || "https://campusride-deploy.vercel.app";
  return `${base.replace(/\/$/, "")}/track/${token}`;
}

function assertRidePointsWithinCampus(pickup, drop, boundaryPolygon) {
  if (!ENFORCE_CAMPUS_BOUNDARY) return;
  if (!isWithinBoundary(pickup, boundaryPolygon)) {
    throw new AppError(400, "Pickup location must be inside the campus.");
  }
  if (!isWithinBoundary(drop, boundaryPolygon)) {
    throw new AppError(400, "Drop location must be inside the campus boundary.");
  }
}

function assertPickupGpsVerification(pickup, studentGps, boundaryPolygon) {
  if (!studentGps || typeof studentGps.lat !== "number" || typeof studentGps.lng !== "number") {
    throw new AppError(400, "Enable GPS location to verify your pickup point.");
  }

  const accuracy = Number(studentGps.accuracy);
  const isCoarseGps = !Number.isFinite(accuracy) || accuracy > COARSE_GPS_ACCURACY_THRESHOLD_METERS;

  if (ENFORCE_CAMPUS_BOUNDARY && !isWithinBoundary(studentGps, boundaryPolygon) && !isCoarseGps) {
    throw new AppError(400, "Pickup location must be inside the campus.");
  }

  const meters = distanceInMeters(
    { lat: studentGps.lat, lng: studentGps.lng },
    { lat: pickup.lat, lng: pickup.lng },
  );

  if (ENFORCE_CAMPUS_BOUNDARY && meters > MAX_PICKUP_GPS_DISTANCE_METERS && !isCoarseGps) {
    throw new AppError(400, "Pickup location must be within 200 meters of your current GPS location.");
  }
}

function parseBooleanSetting(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function parseNumberSetting(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeStopList(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;

  const normalized = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = String(item.name || "").trim();
      const lat = Number(item.lat);
      const lng = Number(item.lng);
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { name, lat, lng };
    })
    .filter(Boolean);

  return normalized.length > 0 ? normalized : fallback;
}

function normalizePolygon(value, fallback = CAMPUS_BOUNDARY_POLYGON) {
  if (!Array.isArray(value)) return fallback;

  const normalized = value
    .map((point) => {
      if (Array.isArray(point) && point.length >= 2) {
        const lat = Number(point[0]);
        const lng = Number(point[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
        return null;
      }

      if (point && typeof point === "object") {
        const lat = Number(point.lat);
        const lng = Number(point.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      }

      return null;
    })
    .filter(Boolean);

  if (normalized.length < 3) return fallback;

  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  if (first.lat !== last.lat || first.lng !== last.lng) {
    normalized.push({ ...first });
  }

  return normalized;
}

function isWithinBoundary(point, polygon = CAMPUS_BOUNDARY_POLYGON) {
  if (!point || typeof point.lat !== "number" || typeof point.lng !== "number") return false;
  if (!Array.isArray(polygon) || polygon.length < 3) return false;

  const latitudes = polygon.map((entry) => entry.lat);
  const longitudes = polygon.map((entry) => entry.lng);
  const insideBounds = point.lat >= Math.min(...latitudes)
    && point.lat <= Math.max(...latitudes)
    && point.lng >= Math.min(...longitudes)
    && point.lng <= Math.max(...longitudes);

  return insideBounds && pointInPolygon(point, polygon);
}

function getTodayDateRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
}

function getRideFinancials(ride) {
  const totalFare = Number(ride?.fareBreakdown?.totalFare || 0);
  const platformFee = Number(ride?.fareBreakdown?.platformFee || 0);
  const driverEarning = Number((totalFare - platformFee).toFixed(2));

  return {
    totalFare: Number(totalFare.toFixed(2)),
    platformFee: Number(platformFee.toFixed(2)),
    driverEarning,
  };
}

async function getRideRuntimeSettings(collegeId = null) {
  const keys = Object.values(RIDE_SETTING_KEYS);
  const rows = await Setting.find({ key: { $in: keys } }).lean();
  const map = new Map(rows.map((row) => [row.key, row.value]));

  const college = collegeId && mongoose.Types.ObjectId.isValid(collegeId)
    ? await College.findById(collegeId).lean()
    : null;

  const collegeConfig = college?.config || {};
  const collegeBoundary = Array.isArray(college?.boundaryPolygon) && college.boundaryPolygon.length >= 3
    ? college.boundaryPolygon
    : null;

  return {
    collegeId: college?._id?.toString?.() || null,
    bookingEnabled: parseBooleanSetting(map.get(RIDE_SETTING_KEYS.bookingEnabled), DEFAULT_RIDE_SETTINGS.bookingEnabled),
    maxPassengers: Math.max(1, Math.min(6, parseNumberSetting(collegeConfig.maxPassengers ?? map.get(RIDE_SETTING_KEYS.maxPassengers), DEFAULT_RIDE_SETTINGS.maxPassengers))),
    cancellationWindowMinutes: Math.max(0, parseNumberSetting(map.get(RIDE_SETTING_KEYS.cancellationWindowMinutes), DEFAULT_RIDE_SETTINGS.cancellationWindowMinutes)),
    locationSyncIntervalSeconds: Math.max(1, parseNumberSetting(map.get(RIDE_SETTING_KEYS.locationSyncIntervalSeconds), DEFAULT_RIDE_SETTINGS.locationSyncIntervalSeconds)),
    supportPhone: String(map.get(RIDE_SETTING_KEYS.supportPhone) || DEFAULT_RIDE_SETTINGS.supportPhone),
    baseFare: Math.max(0, parseNumberSetting(collegeConfig.baseFare ?? map.get(RIDE_SETTING_KEYS.baseFare), DEFAULT_RIDE_SETTINGS.baseFare)),
    perKmRate: Math.max(0, parseNumberSetting(collegeConfig.perKmRate ?? map.get(RIDE_SETTING_KEYS.perKmRate), DEFAULT_RIDE_SETTINGS.perKmRate)),
    perMinuteRate: Math.max(0, parseNumberSetting(collegeConfig.perMinuteRate ?? map.get(RIDE_SETTING_KEYS.perMinuteRate), DEFAULT_RIDE_SETTINGS.perMinuteRate)),
    minimumFare: Math.max(0, parseNumberSetting(collegeConfig.minimumFare ?? map.get(RIDE_SETTING_KEYS.minimumFare), DEFAULT_RIDE_SETTINGS.minimumFare)),
    platformFeePercent: Math.max(0, Math.min(100, parseNumberSetting(collegeConfig.platformFeePercent ?? map.get(RIDE_SETTING_KEYS.platformFeePercent), DEFAULT_RIDE_SETTINGS.platformFeePercent))),
    matchingRadiusKm: Math.max(0.2, parseNumberSetting(collegeConfig.matchingRadiusKm, DEFAULT_RIDE_SETTINGS.matchingRadiusKm)),
    pickupDropStops: normalizeStopList(map.get(RIDE_SETTING_KEYS.pickupDropStops), DEFAULT_RIDE_SETTINGS.pickupDropStops),
    campusBoundary: collegeBoundary
      ? normalizePolygon(collegeBoundary, DEFAULT_RIDE_SETTINGS.campusBoundaryPolygon)
      : normalizePolygon(map.get(RIDE_SETTING_KEYS.campusBoundaryPolygon), DEFAULT_RIDE_SETTINGS.campusBoundaryPolygon),
  };
}

function parseScheduledAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, "Invalid scheduled date/time");
  }
  return date;
}

function resolveCancellation(reasonKey, customReason, fallbackReason) {
  if (reasonKey && CANCELLATION_REASONS[reasonKey]) {
    const reasonText = reasonKey === "other"
      ? (customReason?.trim() || fallbackReason?.trim() || "Other")
      : CANCELLATION_REASONS[reasonKey];

    return {
      reasonKey,
      customReason: customReason?.trim() || "",
      reasonText,
    };
  }

  const text = (fallbackReason || customReason || "Other").trim();
  return {
    reasonKey: "other",
    customReason: customReason?.trim() || text,
    reasonText: text,
  };
}

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().min(2).max(140).optional(),
});

export const bookRideSchema = z.object({
  pickup: locationSchema,
  drop: locationSchema,
  studentGps: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().positive().max(5000).optional(),
  }).optional(),
  passengers: z.number().int().min(1).max(6).optional(),
  passengerNames: z.array(z.string().min(1).max(60)).max(10).optional(),
  scheduledAt: z.string().datetime().optional(),
  splitFare: z.boolean().optional(),
});

export const fareEstimateSchema = z.object({
  pickup: locationSchema,
  drop: locationSchema,
});

export const cancelRideSchema = z.object({
  reason: z.string().min(3).max(240).optional(),
  reasonKey: z.enum(Object.keys(CANCELLATION_REASONS)).optional(),
  customReason: z.string().max(240).optional(),
});

export const verifyRideSchema = z.object({
  code: z
    .union([z.string(), z.number()])
    .transform((value) => String(value).trim())
    .refine((value) => /^\d{2}$/.test(value), { message: "Code must be exactly 2 digits" }),
});

export const driverLocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).optional(),
  timestamp: z.string().datetime().optional(),
});

export const rideFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  message: z.string().max(500).optional().default(""),
});

export const bookRide = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.STUDENT) {
    throw new AppError(403, "Only students can book rides");
  }

  const student = await User.findById(req.user.id).select("collegeId").lean();
  if (!student?.collegeId) {
    throw new AppError(400, "Your account is not mapped to a college. Contact admin.");
  }

  const settings = await getRideRuntimeSettings(student.collegeId.toString());
  if (!settings.bookingEnabled) {
    throw new AppError(409, `Ride booking is currently disabled. Contact support at ${settings.supportPhone}`);
  }

  assertRidePointsWithinCampus(req.body.pickup, req.body.drop, settings.campusBoundary);
  assertPickupGpsVerification(req.body.pickup, req.body.studentGps, settings.campusBoundary);

  const requestedPassengers = req.body.passengers || 1;
  const passengerNames = (req.body.passengerNames || []).slice(0, requestedPassengers);
  const splitFare = Boolean(req.body.splitFare);
  const scheduledFor = parseScheduledAt(req.body.scheduledAt);
  const isScheduled = Boolean(scheduledFor && scheduledFor.getTime() > Date.now() + 60 * 1000);

  if (requestedPassengers > settings.maxPassengers) {
    throw new AppError(400, `Maximum ${settings.maxPassengers} passengers allowed per ride`);
  }

  if (passengerNames.length > requestedPassengers) {
    throw new AppError(400, "Passenger names exceed passenger count");
  }

  const [activeRideCount, onlineDriverCount, onlineDrivers] = await Promise.all([
    Ride.countDocuments({ collegeId: student.collegeId, status: { $in: [...REQUESTED_LIKE_STATUSES, RIDE_STATUS.ACCEPTED, ...ONGOING_LIKE_STATUSES] } }),
    User.countDocuments({ role: ROLES.DRIVER, collegeId: student.collegeId, isOnline: true, driverApprovalStatus: "approved" }),
    User.find({ role: ROLES.DRIVER, collegeId: student.collegeId, isOnline: true, driverApprovalStatus: "approved" }).select("_id").lean(),
  ]);

  const fareBreakdown = estimateRideFare({
    pickup: req.body.pickup,
    drop: req.body.drop,
    activeRideCount,
    onlineDriverCount,
    baseFare: settings.baseFare,
    perKmRate: settings.perKmRate,
    perMinuteRate: settings.perMinuteRate,
    minimumFare: settings.minimumFare,
    platformFeePercent: settings.platformFeePercent,
  });

  if (splitFare && requestedPassengers > 1) {
    fareBreakdown.perPassengerFare = Number((fareBreakdown.totalFare / requestedPassengers).toFixed(2));
  }

  const match = isScheduled
    ? { bestDriver: null, candidates: [], totalCandidates: 0 }
    : await findBestDriverForRide({
      pickup: req.body.pickup,
      drop: req.body.drop,
      passengers: requestedPassengers,
      collegeId: student.collegeId.toString(),
      matchingRadiusKm: settings.matchingRadiusKm,
    });

  const now = new Date();
  const verificationCode = await generateUniqueRideCode(Ride);
  const sharedLinkToken = generateShareTrackingToken();
  const sharedLinkExpiresAt = new Date((scheduledFor?.getTime() || now.getTime()) + DEFAULT_SHARE_LINK_TTL_MS);

  const rideDoc = {
    studentId: new mongoose.Types.ObjectId(req.user.id),
    collegeId: student.collegeId,
    driverId: null,
    pickup: req.body.pickup,
    drop: req.body.drop,
    passengers: requestedPassengers,
    passengerNames,
    isGroupRide: requestedPassengers > 1,
    status: isScheduled ? RIDE_STATUS.SCHEDULED : RIDE_STATUS.REQUESTED,
    scheduledFor: isScheduled ? scheduledFor : null,
    scheduleActivatedAt: null,
    smartMatch: match,
    fareBreakdown,
    verificationCode,
    sharedLinkToken,
    sharedLinkExpiresAt,
    deniedDriverIds: [],
    cancelReason: null,
    cancelledBy: null,
    driverLocation: null,
    requestedAt: isScheduled ? null : now,
    acceptedAt: null,
    ongoingAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const ride = await Ride.create(rideDoc);

  if (isScheduled) {
    await ScheduledRide.create({
      rideId: ride._id,
      studentId: ride.studentId,
      triggerAt: scheduledFor,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  }

  const populatedRide = await Ride.findById(ride._id)
    .populate("studentId", "name email phone")
    .populate("driverId", "name email phone")
    .lean();

  const serialized = serializeRide(populatedRide || ride);
  const onlineDriverIds = onlineDrivers.map((driver) => driver._id?.toString?.() || String(driver._id));

  if (!isScheduled) {
    emitNewRideRequest(serialized, onlineDriverIds);
  }
  emitRideUpdate(serialized);
  await createRideStatusNotifications(serialized);
  res.status(201).json({ ride: serialized });
});

export const estimateFare = asyncHandler(async (req, res) => {
  const settings = await getRideRuntimeSettings(req.user.collegeId || null);
  assertRidePointsWithinCampus(req.body.pickup, req.body.drop, settings.campusBoundary);

  const [activeRideCount, onlineDriverCount] = await Promise.all([
    Ride.countDocuments({ ...(settings.collegeId ? { collegeId: settings.collegeId } : {}), status: { $in: [...REQUESTED_LIKE_STATUSES, RIDE_STATUS.ACCEPTED, ...ONGOING_LIKE_STATUSES] } }),
    User.countDocuments({ role: ROLES.DRIVER, ...(settings.collegeId ? { collegeId: settings.collegeId } : {}), isOnline: true, driverApprovalStatus: "approved" }),
  ]);

  const fare = estimateRideFare({
    pickup: req.body.pickup,
    drop: req.body.drop,
    activeRideCount,
    onlineDriverCount,
    baseFare: settings.baseFare,
    perKmRate: settings.perKmRate,
    perMinuteRate: settings.perMinuteRate,
    minimumFare: settings.minimumFare,
    platformFeePercent: settings.platformFeePercent,
  });

  res.json({ fare });
});

export const listMyRides = asyncHandler(async (req, res) => {
  const query = req.user.role === ROLES.STUDENT
    ? { studentId: new mongoose.Types.ObjectId(req.user.id) }
    : req.user.role === ROLES.DRIVER
      ? { driverId: new mongoose.Types.ObjectId(req.user.id) }
      : (req.user.role === ROLES.SUB_ADMIN && req.user.collegeId)
        ? { collegeId: new mongoose.Types.ObjectId(req.user.collegeId) }
        : {};

  // Driver dashboards behave as a queue: oldest accepted ride should stay active first.
  const sortByCreatedAt = req.user.role === ROLES.DRIVER ? 1 : -1;

  const rides = await Ride.find(query)
    .populate("studentId", "name email phone")
    .populate("driverId", "name email phone")
    .sort({ createdAt: sortByCreatedAt })
    .limit(200)
    .lean();
  res.json({ rides: rides.map(serializeRide) });
});

export const listRideHistory = asyncHandler(async (req, res) => {
  const query = req.user.role === ROLES.STUDENT
    ? { studentId: new mongoose.Types.ObjectId(req.user.id) }
    : req.user.role === ROLES.DRIVER
      ? { driverId: new mongoose.Types.ObjectId(req.user.id) }
      : (req.user.role === ROLES.SUB_ADMIN && req.user.collegeId)
        ? { collegeId: new mongoose.Types.ObjectId(req.user.collegeId) }
        : {};

  const rides = await Ride.find({
    ...query,
    status: { $in: [RIDE_STATUS.COMPLETED, RIDE_STATUS.CANCELLED] },
  })
    .populate("studentId", "name email phone")
    .populate("driverId", "name email phone")
    .sort({ updatedAt: -1 })
    .limit(200)
    .lean();

  res.json({ rides: rides.map(serializeRide) });
});

export const getDriverTodayEarnings = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.DRIVER) {
    throw new AppError(403, "Only drivers can view today earnings");
  }

  const { start, end } = getTodayDateRange();
  const driverId = new mongoose.Types.ObjectId(req.user.id);

  const rides = await Ride.find({
    driverId,
    status: RIDE_STATUS.COMPLETED,
    completedAt: { $gte: start, $lt: end },
  })
    .populate("studentId", "name email phone")
    .populate("driverId", "name email phone")
    .sort({ completedAt: -1 })
    .lean();

  const serializedRides = rides.map((ride) => {
    const serialized = serializeRide(ride);
    const financials = getRideFinancials(ride);

    return {
      ...serialized,
      rideTime: serialized.completedAt || serialized.updatedAt || serialized.createdAt,
      totalFare: financials.totalFare,
      platformFee: financials.platformFee,
      driverEarning: financials.driverEarning,
    };
  });

  const summary = serializedRides.reduce((accumulator, ride) => ({
    totalEarnings: accumulator.totalEarnings + ride.totalFare,
    platformCharges: accumulator.platformCharges + ride.platformFee,
    netDriverEarnings: accumulator.netDriverEarnings + ride.driverEarning,
    completedRides: accumulator.completedRides + 1,
  }), {
    totalEarnings: 0,
    platformCharges: 0,
    netDriverEarnings: 0,
    completedRides: 0,
  });

  res.json({
    summary: {
      totalEarnings: Number(summary.totalEarnings.toFixed(2)),
      platformCharges: Number(summary.platformCharges.toFixed(2)),
      netDriverEarnings: Number(summary.netDriverEarnings.toFixed(2)),
      completedRides: summary.completedRides,
      currency: serializedRides[0]?.fareBreakdown?.currency || "INR",
      date: start.toISOString(),
    },
    rides: serializedRides,
  });
});

export const listAvailableRides = asyncHandler(async (req, res) => {
  const driverObjectId = new mongoose.Types.ObjectId(req.user.id);
  const driver = await User.findById(req.user.id).select("collegeId").lean();
  if (!driver?.collegeId) {
    return res.json({ rides: [] });
  }

  const rides = await Ride.find({
    collegeId: driver.collegeId,
    status: { $in: REQUESTED_LIKE_STATUSES },
    driverId: null,
    deniedDriverIds: { $ne: driverObjectId },
  })
    .populate("studentId", "name email phone")
    .sort({ requestedAt: -1 })
    .limit(100)
    .lean();

  res.json({ rides: rides.map(serializeRide) });
});

export const getRideById = asyncHandler(async (req, res) => {
  const ride = await Ride.findById(req.params.rideId)
    .populate("studentId", "name email phone")
    .populate("driverId", "name email phone")
    .lean();
  if (!ride) {
    throw new AppError(404, "Ride not found");
  }

  enforceRideAccess(req.user, ride);
  res.json({ ride: serializeRide(ride) });
});

export const getRideByShareToken = asyncHandler(async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token || token.length < 20) {
    throw new AppError(400, "Invalid tracking token");
  }

  const ride = await Ride.findOne({ sharedLinkToken: token })
    .populate("studentId", "name")
    .populate("driverId", "name phone")
    .lean();

  if (!ride) {
    throw new AppError(404, "Tracking link not found");
  }

  const expired = !ride.sharedLinkExpiresAt || new Date(ride.sharedLinkExpiresAt).getTime() < Date.now();
  if (expired || [RIDE_STATUS.COMPLETED, RIDE_STATUS.CANCELLED].includes(ride.status)) {
    throw new AppError(410, "Tracking link has expired");
  }

  const serialized = serializeRide(ride);
  res.json({
    ride: {
      id: serialized.id,
      status: serialized.status,
      pickup: serialized.pickup,
      drop: serialized.drop,
      driver: serialized.driver,
      driverLocation: serialized.driverLocation,
      etaMinutes: serialized.etaMinutes,
      etaDistanceKm: serialized.etaDistanceKm,
      isDelayed: serialized.isDelayed,
      delayReason: serialized.delayReason,
      sharedLinkExpiresAt: serialized.sharedLinkExpiresAt,
      createdAt: serialized.createdAt,
      acceptedAt: serialized.acceptedAt,
      ongoingAt: serialized.ongoingAt,
      completedAt: serialized.completedAt,
      cancelledAt: serialized.cancelledAt,
    },
    socketRoom: `share:${token}`,
  });
});

export const acceptRide = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.DRIVER) {
    throw new AppError(403, "Only drivers can accept rides");
  }

  const driver = await User.findById(req.user.id).lean();
  if (!driver) {
    throw new AppError(404, "Driver not found");
  }
  if (driver.driverApprovalStatus !== "approved" || (driver.driverVerificationStatus && driver.driverVerificationStatus !== "approved")) {
    throw new AppError(403, "Driver verification pending. Upload documents and wait for admin approval.");
  }
  if (!driver.collegeId) {
    throw new AppError(403, "Driver is not mapped to any college");
  }

  const rideId = new mongoose.Types.ObjectId(req.params.rideId);
  const now = new Date();

  const updatedRide = await Ride.findOneAndUpdate(
    {
      _id: rideId,
      status: { $in: REQUESTED_LIKE_STATUSES },
      driverId: null,
      deniedDriverIds: { $ne: new mongoose.Types.ObjectId(req.user.id) },
      collegeId: driver.collegeId,
    },
    {
      $set: {
        status: RIDE_STATUS.ACCEPTED,
        driverId: new mongoose.Types.ObjectId(req.user.id),
        acceptedAt: now,
        deniedDriverIds: [],
        updatedAt: now,
      },
    },
    { new: true, lean: true },
  );

  if (!updatedRide) {
    throw new AppError(409, "Ride is no longer available for acceptance");
  }

  const populated = await Ride.findById(updatedRide._id)
    .populate("studentId", "name email phone")
    .populate("driverId", "name email phone")
    .lean();

  const ride = serializeRide(populated);
  emitRideUpdate(ride);
  await createRideStatusNotifications(ride);
  res.json({ ride });
});

export const rejectRide = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.DRIVER) {
    throw new AppError(403, "Only drivers can reject rides");
  }

  const rideId = new mongoose.Types.ObjectId(req.params.rideId);
  const now = new Date();

  const deniedRide = await Ride.findOneAndUpdate(
    {
      _id: rideId,
      status: { $in: REQUESTED_LIKE_STATUSES },
      driverId: null,
      ...(req.user.collegeId ? { collegeId: new mongoose.Types.ObjectId(req.user.collegeId) } : {}),
    },
    {
      $addToSet: {
        deniedDriverIds: new mongoose.Types.ObjectId(req.user.id),
      },
      $set: {
        updatedAt: now,
      },
    },
    { new: true, lean: true },
  );

  if (!deniedRide) {
    throw new AppError(409, "Ride is no longer available to deny");
  }

  res.json({ message: "Ride denied for this driver" });
});

async function startAcceptedRide({ rideId, driverId, verificationCode, requireVerification = false }) {
  const now = new Date();
  const current = await Ride.findById(rideId).lean();

  if (!current) {
    throw new AppError(404, "Ride not found");
  }

  if (!current.driverId || current.driverId.toString() !== driverId) {
    throw new AppError(403, "You are not assigned to this ride");
  }

  if (current.status !== RIDE_STATUS.ACCEPTED) {
    throw new AppError(409, "Ride must be accepted before starting");
  }

  if (requireVerification) {
    if (typeof verificationCode !== "string" || verificationCode.trim().length === 0) {
      throw new AppError(400, "Verification code is required to start the ride");
    }

    if (current.verificationCode !== verificationCode.trim()) {
      throw new AppError(400, "Invalid verification code");
    }
  }

  const updatedRide = await Ride.findOneAndUpdate(
    { _id: rideId, status: RIDE_STATUS.ACCEPTED, driverId: new mongoose.Types.ObjectId(driverId) },
    {
      $set: {
        status: RIDE_STATUS.ONGOING,
        ongoingAt: now,
        updatedAt: now,
      },
    },
    { new: true, lean: true },
  );

  if (!updatedRide) {
    throw new AppError(409, "Ride could not be started");
  }

  const populated = await Ride.findById(updatedRide._id)
    .populate("studentId", "name email phone")
    .populate("driverId", "name email phone")
    .lean();

  const ride = serializeRide(populated);
  emitRideUpdate(ride);
  await createRideStatusNotifications(ride);
  return ride;
}

export const startRide = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.DRIVER) {
    throw new AppError(403, "Only drivers can start rides");
  }

  const rideId = new mongoose.Types.ObjectId(req.params.rideId);
  const ride = await startAcceptedRide({ rideId, driverId: req.user.id, requireVerification: false });
  res.json({ ride });
});

export const verifyRideStart = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.DRIVER) {
    throw new AppError(403, "Only drivers can verify ride code");
  }

  const rideId = new mongoose.Types.ObjectId(req.params.rideId);
  const ride = await startAcceptedRide({
    rideId,
    driverId: req.user.id,
    verificationCode: req.body.code,
    requireVerification: true,
  });
  res.json({ ride });
});

export const completeRide = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.DRIVER) {
    throw new AppError(403, "Only drivers can complete rides");
  }

  const rideId = new mongoose.Types.ObjectId(req.params.rideId);
  const now = new Date();

  const ride = await Ride.findById(rideId).lean();
  if (!ride) {
    throw new AppError(404, "Ride not found");
  }

  if (!ride.driverId || ride.driverId.toString() !== req.user.id) {
    throw new AppError(403, "You are not assigned to this ride");
  }

  if (!isOngoingLikeStatus(ride.status)) {
    throw new AppError(409, "Only ongoing rides can be completed");
  }

  const updatedRide = await Ride.findOneAndUpdate(
    { _id: rideId, status: { $in: ONGOING_LIKE_STATUSES } },
    {
      $set: {
        status: RIDE_STATUS.COMPLETED,
        verificationCode: "",
        sharedLinkExpiresAt: now,
        completedAt: now,
        updatedAt: now,
      },
    },
    { new: true, lean: true },
  );

  const populated = await Ride.findById(updatedRide._id)
    .populate("studentId", "name email phone")
    .populate("driverId", "name email phone")
    .lean();

  const updated = serializeRide(populated);

  if (updated.studentId && updated.driverId) {
    await Payment.create({
      rideId: new mongoose.Types.ObjectId(updated.id),
      studentId: new mongoose.Types.ObjectId(updated.studentId),
      driverId: new mongoose.Types.ObjectId(updated.driverId),
      amount: updated.fareBreakdown?.totalFare || 0,
      currency: updated.fareBreakdown?.currency || "INR",
      method: "cash",
      status: "paid",
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }

  emitRideUpdate(updated);
  await createRideStatusNotifications(updated);
  await recomputeDriverPerformance(updated.driverId);

  if (updated.student?.email) {
    const invoiceBuffer = await generateRideInvoiceBuffer({
      ride: updated,
      student: updated.student,
      driver: updated.driver,
    });

    const emailResult = await sendRideInvoiceEmail({
      to: updated.student.email,
      name: updated.student.name,
      rideId: updated.id,
      fare: updated.fareBreakdown?.totalFare || 0,
      pickup: updated.pickup?.label,
      drop: updated.drop?.label,
      createdAt: updated.createdAt ? new Date(updated.createdAt).toLocaleString() : "",
      completedAt: updated.completedAt ? new Date(updated.completedAt).toLocaleString() : "",
      pdfBuffer: invoiceBuffer,
    });

    await EmailLog.create({
      to: updated.student.email,
      subject: `CampusRide Receipt • Ride ${updated.id}`,
      type: "ride_invoice",
      status: emailResult.sent ? "sent" : "failed",
      reason: emailResult.reason || "",
      rideId: new mongoose.Types.ObjectId(updated.id),
      metadata: {
        driverId: updated.driverId,
        studentId: updated.studentId,
      },
      createdAt: new Date(),
    });
  } else {
    await EmailLog.create({
      to: "unknown",
      subject: `CampusRide Receipt • Ride ${updated.id}`,
      type: "ride_invoice",
      status: "skipped",
      reason: "Student email unavailable",
      rideId: new mongoose.Types.ObjectId(updated.id),
      metadata: {
        driverId: updated.driverId,
        studentId: updated.studentId,
      },
      createdAt: new Date(),
    });
  }

  res.json({ ride: updated });
});

export const submitRideFeedback = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.STUDENT) {
    throw new AppError(403, "Only students can submit feedback");
  }

  const rideId = new mongoose.Types.ObjectId(req.params.rideId);
  const now = new Date();

  const ride = await Ride.findById(rideId).lean();
  if (!ride) {
    throw new AppError(404, "Ride not found");
  }

  if (!ride.studentId || ride.studentId.toString() !== req.user.id) {
    throw new AppError(403, "You can only review your own rides");
  }

  if (ride.status !== RIDE_STATUS.COMPLETED) {
    throw new AppError(409, "Feedback can be submitted only after ride completion");
  }

  const updatedRide = await Ride.findOneAndUpdate(
    { _id: rideId, status: RIDE_STATUS.COMPLETED },
    {
      $set: {
        studentRating: req.body.rating,
        studentFeedback: req.body.message || "",
        feedbackAt: now,
        updatedAt: now,
      },
    },
    { new: true, lean: true },
  );

  const populated = await Ride.findById(updatedRide._id)
    .populate("studentId", "name email phone")
    .populate("driverId", "name email phone")
    .lean();

  const serialized = serializeRide(populated);

  if (ride.driverId && ride.studentId) {
    await Rating.findOneAndUpdate(
      { rideId: new mongoose.Types.ObjectId(rideId) },
      {
        $set: {
          rideId: new mongoose.Types.ObjectId(rideId),
          fromUserId: new mongoose.Types.ObjectId(ride.studentId),
          toUserId: new mongoose.Types.ObjectId(ride.driverId),
          rating: req.body.rating,
          comment: req.body.message || "",
          createdAt: now,
        },
      },
      { upsert: true, new: true },
    );
  }

  emitRideUpdate(serialized);
  await createRideStatusNotifications(serialized);
  if (serialized.driverId) {
    await recomputeDriverPerformance(serialized.driverId);
  }
  res.json({ ride: serialized });
});

export const cancelRide = asyncHandler(async (req, res) => {
  const rideId = new mongoose.Types.ObjectId(req.params.rideId);
  const now = new Date();
  const settings = await getRideRuntimeSettings();

  const ride = await Ride.findById(rideId).lean();
  if (!ride) {
    throw new AppError(404, "Ride not found");
  }

  const isStudent = req.user.role === ROLES.STUDENT && ride.studentId?.toString() === req.user.id;
  const isDriver = req.user.role === ROLES.DRIVER && ride.driverId?.toString() === req.user.id;
  const isAdmin = ADMIN_DASHBOARD_ROLES.includes(req.user.role);

  if (!isStudent && !isDriver && !isAdmin) {
    throw new AppError(403, "Not allowed to cancel this ride");
  }

  if (req.user.role === ROLES.SUB_ADMIN) {
    const rideCollegeId = ride.collegeId?.toString?.() || null;
    if (!req.user.collegeId || rideCollegeId !== req.user.collegeId) {
      throw new AppError(403, "Sub admin cannot cancel rides outside assigned college");
    }
  }

  if (ride.status === RIDE_STATUS.COMPLETED || ride.status === RIDE_STATUS.CANCELLED) {
    throw new AppError(409, "Ride is already finalized");
  }

  if (isStudent && ![RIDE_STATUS.SCHEDULED, ...REQUESTED_LIKE_STATUSES, RIDE_STATUS.ACCEPTED].includes(ride.status)) {
    throw new AppError(409, "Students can cancel only requested or accepted rides");
  }

  if (isStudent && settings.cancellationWindowMinutes > 0 && ride.requestedAt) {
    const elapsedMs = now.getTime() - new Date(ride.requestedAt).getTime();
    const elapsedMinutes = elapsedMs / 60000;
    if (elapsedMinutes > settings.cancellationWindowMinutes) {
      throw new AppError(
        409,
        `Cancellation window exceeded (${settings.cancellationWindowMinutes} minutes). Contact support at ${settings.supportPhone}`,
      );
    }
  }

  if (isDriver && ![RIDE_STATUS.ACCEPTED, ...ONGOING_LIKE_STATUSES].includes(ride.status)) {
    throw new AppError(409, "Drivers can cancel only accepted or ongoing rides");
  }

  const cancelledBy = isStudent ? ROLES.STUDENT : isDriver ? ROLES.DRIVER : ROLES.ADMIN;
  const cancellation = resolveCancellation(req.body.reasonKey, req.body.customReason, req.body.reason);
  const updatedRide = await Ride.findOneAndUpdate(
    { _id: rideId, status: { $in: [RIDE_STATUS.SCHEDULED, ...REQUESTED_LIKE_STATUSES, RIDE_STATUS.ACCEPTED, ...ONGOING_LIKE_STATUSES] } },
    {
      $set: {
        status: RIDE_STATUS.CANCELLED,
        cancelReason: cancellation.reasonText,
        cancellationReasonKey: cancellation.reasonKey,
        cancellationCustomReason: cancellation.customReason,
        cancelledBy,
        sharedLinkExpiresAt: now,
        cancelledAt: now,
        updatedAt: now,
      },
    },
    { new: true, lean: true },
  );

  const populated = await Ride.findById(updatedRide._id)
    .populate("studentId", "name email phone")
    .populate("driverId", "name email phone")
    .lean();

  const updated = serializeRide(populated);

  await Cancellation.create({
    rideId,
    collegeId: ride.collegeId || null,
    cancelledByUserId: new mongoose.Types.ObjectId(req.user.id),
    cancelledByRole: cancelledBy,
    reasonKey: cancellation.reasonKey,
    customReason: cancellation.customReason,
    reasonText: cancellation.reasonText,
    createdAt: now,
  });

  await ScheduledRide.updateOne(
    { rideId },
    {
      $set: {
        status: "cancelled",
        updatedAt: now,
      },
    },
  );

  emitRideUpdate(updated);
  await createRideStatusNotifications(updated);
  if (updated.driverId) {
    await recomputeDriverPerformance(updated.driverId);
  }
  res.json({ ride: updated });
});

export const downloadRideInvoice = asyncHandler(async (req, res) => {
  const ride = await Ride.findById(req.params.rideId)
    .populate("studentId", "name email phone")
    .populate("driverId", "name email phone")
    .lean();

  if (!ride) {
    throw new AppError(404, "Ride not found");
  }

  enforceRideAccess(req.user, ride);
  const serialized = serializeRide(ride);

  const invoiceBuffer = await generateRideInvoiceBuffer({
    ride: serialized,
    student: serialized.student,
    driver: serialized.driver,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=ride-invoice-${serialized.id}.pdf`);
  res.send(invoiceBuffer);
});

export const updateDriverLocation = asyncHandler(async (req, res) => {
  const isDriver = req.user.role === ROLES.DRIVER;
  const isStudent = req.user.role === ROLES.STUDENT;
  if (!isDriver && !isStudent) {
    throw new AppError(403, "Only student or driver can update location");
  }

  const rideId = new mongoose.Types.ObjectId(req.params.rideId);
  const now = new Date();

  const ride = await Ride.findById(rideId).lean();
  if (!ride) {
    throw new AppError(404, "Ride not found");
  }

  const settings = await getRideRuntimeSettings(ride?.collegeId?.toString?.() || null);

  const rideDriverId = ride.driverId?.toString() || null;
  const rideStudentId = ride.studentId?.toString() || null;

  if (isDriver && rideDriverId !== req.user.id) {
    throw new AppError(403, "You are not assigned to this ride");
  }

  if (isStudent && rideStudentId !== req.user.id) {
    throw new AppError(403, "You are not assigned to this ride");
  }

  if (![RIDE_STATUS.ACCEPTED, ...ONGOING_LIKE_STATUSES].includes(ride.status)) {
    throw new AppError(409, "Ride location can be updated only in accepted/ongoing states");
  }

  if (ENFORCE_CAMPUS_BOUNDARY && !isWithinBoundary({ lat: req.body.lat, lng: req.body.lng }, settings.campusBoundary)) {
    throw new AppError(400, "Driver location must stay inside the campus boundary.");
  }

  const lastUpdateAt = isDriver
    ? (ride.driverLocation?.updatedAt ? new Date(ride.driverLocation.updatedAt).getTime() : null)
    : (ride.studentLocation?.updatedAt ? new Date(ride.studentLocation.updatedAt).getTime() : null);

  if (lastUpdateAt) {
    const elapsedSeconds = (now.getTime() - lastUpdateAt) / 1000;
    if (elapsedSeconds < settings.locationSyncIntervalSeconds) {
      throw new AppError(
        429,
        `Location updates are limited to every ${settings.locationSyncIntervalSeconds} seconds`,
      );
    }
  }

  const locationTimestamp = req.body.timestamp ? new Date(req.body.timestamp) : now;
  const normalizedUpdatedAt = Number.isNaN(locationTimestamp.getTime()) ? now : locationTimestamp;

  const updatedRide = await Ride.findOneAndUpdate(
    { _id: rideId },
    {
      $set: {
        [isDriver ? "driverLocation" : "studentLocation"]: {
          lat: req.body.lat,
          lng: req.body.lng,
          ...(isDriver ? { heading: typeof req.body.heading === "number" ? req.body.heading : null } : {}),
          ...(isDriver ? { speed: typeof req.body.speed === "number" ? req.body.speed : null } : {}),
          updatedAt: normalizedUpdatedAt,
        },
        updatedAt: now,
      },
    },
    { new: true, lean: true },
  );

  if (isDriver) {
    await User.updateOne(
      { _id: new mongoose.Types.ObjectId(req.user.id) },
      {
        $set: {
          currentLocation: { lat: req.body.lat, lng: req.body.lng, updatedAt: normalizedUpdatedAt },
          currentLocationGeo: {
            type: "Point",
            coordinates: [req.body.lng, req.body.lat],
          },
          updatedAt: now,
        },
      },
    );
  }

  const populated = await Ride.findById(updatedRide._id)
    .populate("studentId", "name email phone")
    .populate("driverId", "name email phone")
    .lean();

  const updated = serializeRide(populated);
  emitRideUpdate(updated);
  res.json({ ride: updated });
});

function enforceRideAccess(user, ride) {
  if ([ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user.role)) {
    return;
  }

  if (user.role === ROLES.SUB_ADMIN) {
    if (user.collegeId && ride.collegeId?.toString?.() === user.collegeId) {
      return;
    }
    throw new AppError(403, "Forbidden ride access");
  }

  const resolveRefId = (value) => {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object" && value._id) return value._id.toString();
    if (typeof value.toString === "function") return value.toString();
    return null;
  };

  const studentOwnerId = resolveRefId(ride.studentId);
  const driverOwnerId = resolveRefId(ride.driverId);

  const isStudentOwner = user.role === ROLES.STUDENT && studentOwnerId === user.id;
  const isDriverOwner = user.role === ROLES.DRIVER && driverOwnerId === user.id;

  if (!isStudentOwner && !isDriverOwner) {
    throw new AppError(403, "Forbidden ride access");
  }
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function calcDistanceKm(from, to) {
  if (!from || !to) return null;
  if (typeof from.lat !== "number" || typeof from.lng !== "number" || typeof to.lat !== "number" || typeof to.lng !== "number") {
    return null;
  }

  const earthRadiusKm = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getTimingInsights(ride) {
  const now = Date.now();
  const avgCitySpeedKmPerMinute = 0.45;
  const status = ride.status;

  const target = status === RIDE_STATUS.ACCEPTED
    ? ride.pickup
    : isOngoingLikeStatus(status)
      ? ride.drop
      : null;

  const distanceKmRaw = calcDistanceKm(ride.driverLocation, target);
  const distanceKm = typeof distanceKmRaw === "number" ? Number(distanceKmRaw.toFixed(2)) : null;
  const etaMinutes = distanceKm !== null
    ? Math.max(1, Math.round(distanceKm / avgCitySpeedKmPerMinute))
    : null;

  let isDelayed = false;
  let delayReason = null;

  const acceptedAt = ride.acceptedAt ? new Date(ride.acceptedAt).getTime() : null;
  const ongoingAt = ride.ongoingAt ? new Date(ride.ongoingAt).getTime() : null;
  const baselineTripMinutes = Number(ride?.fareBreakdown?.estimatedDurationMinutes || 0);

  if (status === RIDE_STATUS.ACCEPTED && acceptedAt) {
    const waitingMinutes = Math.floor((now - acceptedAt) / 60000);
    if (waitingMinutes >= 8) {
      isDelayed = true;
      delayReason = "Driver is taking longer than expected to reach pickup.";
    }
  }

  if (!isDelayed && isOngoingLikeStatus(status) && ongoingAt && baselineTripMinutes > 0) {
    const inRideMinutes = Math.floor((now - ongoingAt) / 60000);
    if (inRideMinutes > baselineTripMinutes + 8) {
      isDelayed = true;
      delayReason = "Ride is running behind estimated travel time.";
    }
  }

  if (!isDelayed && etaMinutes !== null && etaMinutes > 12) {
    isDelayed = true;
    delayReason = "Traffic or route conditions may cause delay.";
  }

  return {
    etaMinutes,
    etaDistanceKm: distanceKm,
    isDelayed,
    delayReason,
    calculatedAt: new Date(now),
  };
}

function buildRideTimeline(ride) {
  const startedAt = ride.ongoingAt || null;
  const acceptedAt = ride.acceptedAt || null;
  const bookedAt = ride.requestedAt || ride.createdAt || null;
  const completedAt = ride.completedAt || null;
  const cancelledAt = ride.cancelledAt || null;
  const arrivingReached = Boolean(acceptedAt);

  return [
    { key: "booked", label: "Booked", reached: Boolean(bookedAt), timestamp: bookedAt },
    { key: "accepted", label: "Accepted", reached: Boolean(acceptedAt), timestamp: acceptedAt },
    { key: "arriving", label: "Driver Arriving", reached: arrivingReached, timestamp: acceptedAt },
    { key: "started", label: "Started", reached: Boolean(startedAt), timestamp: startedAt },
    {
      key: ride.status === RIDE_STATUS.CANCELLED ? "cancelled" : "completed",
      label: ride.status === RIDE_STATUS.CANCELLED ? "Cancelled" : "Completed",
      reached: ride.status === RIDE_STATUS.CANCELLED ? Boolean(cancelledAt) : Boolean(completedAt),
      timestamp: ride.status === RIDE_STATUS.CANCELLED ? cancelledAt : completedAt,
    },
  ];
}

function serializeRide(ride) {
  if (!ride) return null;

  const shouldExposeVerificationCode = [
    ...REQUESTED_LIKE_STATUSES,
    RIDE_STATUS.ACCEPTED,
    ...ONGOING_LIKE_STATUSES,
  ].includes(ride.status);

  const studentId = ride.studentId && typeof ride.studentId === "object" && ride.studentId._id
    ? ride.studentId._id.toString()
    : ride.studentId?.toString() || null;

  const driverId = ride.driverId && typeof ride.driverId === "object" && ride.driverId._id
    ? ride.driverId._id.toString()
    : ride.driverId?.toString() || null;

  const timing = getTimingInsights(ride);
  const sharedLinkToken = ride.sharedLinkToken || null;

  return {
    id: ride._id.toString(),
    collegeId: ride.collegeId?.toString?.() || null,
    studentId,
    driverId,
    student: ride.studentId && typeof ride.studentId === "object" && ride.studentId._id
      ? {
        id: ride.studentId._id.toString(),
        name: ride.studentId.name || "Student",
        email: ride.studentId.email || null,
        phone: ride.studentId.phone || null,
      }
      : null,
    driver: ride.driverId && typeof ride.driverId === "object" && ride.driverId._id
      ? {
        id: ride.driverId._id.toString(),
        name: ride.driverId.name || "Driver",
        email: ride.driverId.email || null,
        phone: ride.driverId.phone || null,
      }
      : null,
    pickup: ride.pickup,
    drop: ride.drop,
    passengers: ride.passengers || 1,
    passengerNames: ride.passengerNames || [],
    isGroupRide: Boolean(ride.isGroupRide || (ride.passengers || 1) > 1),
    status: ride.status,
    timeline: buildRideTimeline(ride),
    verificationCode: shouldExposeVerificationCode ? (ride.verificationCode || "") : "",
    studentRating: ride.studentRating || null,
    studentFeedback: ride.studentFeedback || "",
    feedbackAt: ride.feedbackAt || null,
    smartMatch: ride.smartMatch || null,
    fareBreakdown: ride.fareBreakdown || null,
    cancelReason: ride.cancelReason || null,
    cancellationReasonKey: ride.cancellationReasonKey || null,
    cancellationCustomReason: ride.cancellationCustomReason || null,
    cancelledBy: ride.cancelledBy || null,
    driverLocation: ride.driverLocation || null,
    studentLocation: ride.studentLocation || null,
    etaMinutes: timing.etaMinutes,
    etaDistanceKm: timing.etaDistanceKm,
    isDelayed: timing.isDelayed,
    delayReason: timing.delayReason,
    timingCalculatedAt: timing.calculatedAt,
    sharedLinkExpiresAt: ride.sharedLinkExpiresAt || null,
    shareTrackingUrl: getShareTrackingUrl(sharedLinkToken),
    sharedLinkToken: sharedLinkToken,
    requestedAt: ride.requestedAt || null,
    acceptedAt: ride.acceptedAt || null,
    ongoingAt: ride.ongoingAt || null,
    completedAt: ride.completedAt || null,
    scheduledFor: ride.scheduledFor || null,
    scheduleActivatedAt: ride.scheduleActivatedAt || null,
    cancelledAt: ride.cancelledAt || null,
    createdAt: ride.createdAt,
    updatedAt: ride.updatedAt,
  };
}