import { ROLES, RIDE_STATUS } from "../constants/roles.js";
import { Cancellation, Ride, ScheduledRide, User } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function getCollegeScopedFilters(req) {
  if (req.user.role === ROLES.SUB_ADMIN && req.user.collegeId) {
    return { collegeId: req.user.collegeId };
  }
  return null;
}

export const getDashboardAnalytics = asyncHandler(async (req, res) => {
  const scope = getCollegeScopedFilters(req);
  const userScope = scope ? { collegeId: scope.collegeId } : {};
  const rideScope = scope ? { collegeId: scope.collegeId } : {};

  const [
    totalUsers,
    activeUsers,
    onlineUsers,
    onlineDrivers,
    totalStudents,
    totalDrivers,
    pendingDrivers,
    totalRides,
    requestedRides,
    acceptedRides,
    ongoingRides,
    completedRides,
    cancelledRides,
    cancellations,
  ] = await Promise.all([
    User.countDocuments(userScope),
    User.countDocuments({ ...userScope, isActive: true }),
    User.countDocuments({ ...userScope, isOnline: true }),
    User.countDocuments({ ...userScope, role: ROLES.DRIVER, isOnline: true }),
    User.countDocuments({ ...userScope, role: ROLES.STUDENT }),
    User.countDocuments({ ...userScope, role: ROLES.DRIVER }),
    User.countDocuments({ ...userScope, role: ROLES.DRIVER, driverApprovalStatus: "pending" }),
    Ride.countDocuments(rideScope),
    Ride.countDocuments({ ...rideScope, status: RIDE_STATUS.REQUESTED }),
    Ride.countDocuments({ ...rideScope, status: RIDE_STATUS.ACCEPTED }),
    Ride.countDocuments({ ...rideScope, status: RIDE_STATUS.ONGOING }),
    Ride.countDocuments({ ...rideScope, status: RIDE_STATUS.COMPLETED }),
    Ride.countDocuments({ ...rideScope, status: RIDE_STATUS.CANCELLED }),
    Ride.find({ ...rideScope, status: RIDE_STATUS.CANCELLED }).sort({ cancelledAt: -1 }).limit(100).lean(),
  ]);

  const [driverPerformanceAgg, revenueAgg, todayRevenueAgg, peakHoursAgg] = await Promise.all([
    Ride.aggregate([
      { $match: { status: RIDE_STATUS.COMPLETED, driverId: { $ne: null } } },
      ...(scope ? [{ $match: { collegeId: scope.collegeId } }] : []),
      {
        $group: {
          _id: "$driverId",
          completedRides: { $sum: 1 },
          avgRating: { $avg: "$studentRating" },
          revenue: { $sum: { $ifNull: ["$fareBreakdown.totalFare", 0] } },
        },
      },
      { $sort: { completedRides: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "driver",
        },
      },
      { $unwind: { path: "$driver", preserveNullAndEmptyArrays: true } },
    ]),
    Ride.aggregate([
      { $match: { status: RIDE_STATUS.COMPLETED } },
      ...(scope ? [{ $match: { collegeId: scope.collegeId } }] : []),
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $ifNull: ["$fareBreakdown.totalFare", 0] } },
          avgFare: { $avg: { $ifNull: ["$fareBreakdown.totalFare", 0] } },
        },
      },
    ]),
    (() => {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const startOfTomorrow = new Date(startOfToday);
      startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

      return Ride.aggregate([
        {
          $match: {
            status: RIDE_STATUS.COMPLETED,
            completedAt: { $gte: startOfToday, $lt: startOfTomorrow },
          },
        },
        ...(scope ? [{ $match: { collegeId: scope.collegeId } }] : []),
        {
          $group: {
            _id: null,
            todayRevenue: { $sum: { $ifNull: ["$fareBreakdown.totalFare", 0] } },
          },
        },
      ]);
    })(),
    Ride.aggregate([
      ...(scope ? [{ $match: { collegeId: scope.collegeId } }] : []),
      {
        $group: {
          _id: { $hour: "$createdAt" },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const now = new Date();
  const bookingTrend = [];
  for (let i = 6; i >= 0; i -= 1) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(now.getDate() - i);

    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    bookingTrend.push({
      day: start.toLocaleDateString("en-IN", { weekday: "short" }),
      count: await Ride.countDocuments({ ...rideScope, createdAt: { $gte: start, $lt: end } }),
    });
  }

  const hourMap = new Map(peakHoursAgg.map((item) => [item._id, item.bookings]));
  const peakBookingHours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    bookings: hourMap.get(hour) || 0,
  }));

  const revenue = revenueAgg[0] || { totalRevenue: 0, avgFare: 0 };
  const todayRevenue = todayRevenueAgg[0]?.todayRevenue || 0;
  const cancellationRate = totalRides > 0 ? Number(((cancelledRides / totalRides) * 100).toFixed(2)) : 0;

  const cancellationReasonAgg = await Cancellation.aggregate([
    ...(scope ? [{ $match: { collegeId: scope.collegeId } }] : []),
    {
      $group: {
        _id: "$reasonKey",
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  res.json({
    metrics: {
      totalUsers,
      activeUsers,
      onlineUsers,
      onlineDrivers,
      totalStudents,
      totalDrivers,
      pendingDrivers,
      totalRides,
      requestedRides,
      acceptedRides,
      ongoingRides,
      completedRides,
      cancelledRides,
      cancellationRate,
      todayRevenue: Number(todayRevenue.toFixed(2)),
      totalRevenue: Number((revenue.totalRevenue || 0).toFixed(2)),
      averageFare: Number((revenue.avgFare || 0).toFixed(2)),
    },
    driverPerformance: driverPerformanceAgg.map((item) => ({
      driverId: item._id?.toString() || null,
      driverName: item.driver?.name || "Unknown Driver",
      completedRides: item.completedRides || 0,
      avgRating: Number(((item.avgRating || 0) || 0).toFixed(2)),
      revenue: Number((item.revenue || 0).toFixed(2)),
      performanceScore: Number((item.driver?.driverPerformanceScore || 0).toFixed(2)),
    })),
    cancellationReasons: cancellationReasonAgg.map((item) => ({
      reasonKey: item._id || "other",
      count: item.count || 0,
    })),
    peakBookingHours,
    bookingTrend,
    cancellations: cancellations.map((ride) => ({
      id: ride._id.toString(),
      studentId: ride.studentId?.toString() || null,
      driverId: ride.driverId?.toString() || null,
      cancelledBy: ride.cancelledBy || null,
      cancelReason: ride.cancelReason || null,
      cancelledAt: ride.cancelledAt || null,
      status: ride.status,
    })),
  });
});

export const getFilteredRides = asyncHandler(async (req, res) => {
  const scope = getCollegeScopedFilters(req);
  const query = scope ? { collegeId: scope.collegeId } : {};
  if (req.query.driverId) {
    query.driverId = req.query.driverId;
  }
  if (req.query.status) {
    query.status = req.query.status;
  }
  if (req.query.reasonKey) {
    query.cancellationReasonKey = req.query.reasonKey;
  }
  if (req.query.from || req.query.to) {
    query.createdAt = {};
    if (req.query.from) query.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) query.createdAt.$lte = new Date(req.query.to);
  }

  const rides = await Ride.find(query)
    .populate("studentId", "name email phone")
    .populate("driverId", "name email phone")
    .sort({ createdAt: -1 })
    .limit(300)
    .lean();

  res.json({
    rides: rides.map((ride) => {
      const studentId = ride.studentId && typeof ride.studentId === "object" && ride.studentId._id
        ? ride.studentId._id.toString()
        : ride.studentId?.toString?.() || null;

      const driverId = ride.driverId && typeof ride.driverId === "object" && ride.driverId._id
        ? ride.driverId._id.toString()
        : ride.driverId?.toString?.() || null;

      return {
        id: ride._id.toString(),
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
        pickup: ride.pickup || null,
        drop: ride.drop || null,
        passengers: ride.passengers || 1,
        passengerNames: ride.passengerNames || [],
        isGroupRide: Boolean(ride.isGroupRide || (ride.passengers || 1) > 1),
        status: ride.status,
        verificationCode: [RIDE_STATUS.REQUESTED, RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING, RIDE_STATUS.SCHEDULED].includes(ride.status)
          ? (ride.verificationCode || "")
          : "",
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
    }),
  });
});

export const getScheduledRideQueue = asyncHandler(async (req, res) => {
  const scope = getCollegeScopedFilters(req);
  const rideScope = scope ? { collegeId: scope.collegeId } : {};
  const rideIds = scope
    ? await Ride.find(rideScope).distinct("_id")
    : null;

  const rows = await ScheduledRide.find(scope ? { rideId: { $in: rideIds } } : {})
    .populate("rideId")
    .populate("studentId", "name email phone")
    .sort({ triggerAt: 1 })
    .limit(200)
    .lean();

  res.json({
    queue: rows.map((item) => ({
      id: item._id.toString(),
      status: item.status,
      triggerAt: item.triggerAt,
      lastAttemptAt: item.lastAttemptAt || null,
      errorMessage: item.errorMessage || null,
      rideId: item.rideId?._id?.toString?.() || item.rideId?.toString?.() || null,
      rideStatus: item.rideId?.status || null,
      pickup: item.rideId?.pickup || null,
      drop: item.rideId?.drop || null,
      passengers: item.rideId?.passengers || 1,
      student: item.studentId && item.studentId._id
        ? {
          id: item.studentId._id.toString(),
          name: item.studentId.name || "Student",
          email: item.studentId.email || null,
          phone: item.studentId.phone || null,
        }
        : null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
  });
});