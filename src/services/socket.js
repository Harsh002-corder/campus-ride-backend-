import mongoose from "mongoose";
import { Server } from "socket.io";
import { ROLES } from "../constants/roles.js";
import { Ride, User } from "../models/index.js";
import { verifyJwt } from "../utils/jwt.js";
import { isAllowedOrigin } from "../utils/originMatcher.js";

let io;

const ONGOING_RIDE_STATUSES = ["accepted", "in_progress", "ongoing"];
const DRIVER_LOCATION_EVENT_INTERVAL_MS = 3000;
const socketLastDriverLocationAt = new Map();

function isTrustedVercelOrigin(origin) {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:") return false;
    if (/\.vercel\.app$/i.test(parsed.hostname)) return true;
    if (/^(?:www\.)?campusride\.tech$/i.test(parsed.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

function createSocketCorsBlockedError(origin) {
  const error = new Error(`Socket CORS blocked for origin: ${origin}`);
  error.statusCode = 403;
  error.code = "SOCKET_CORS_FORBIDDEN";
  return error;
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function distanceKm(from, to) {
  if (!from || !to) return null;
  if (typeof from.lat !== "number" || typeof from.lng !== "number") return null;
  if (typeof to.lat !== "number" || typeof to.lng !== "number") return null;

  const earthRadiusKm = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function estimateEtaMinutes(distanceKmValue, speedKmh) {
  if (typeof distanceKmValue !== "number") return null;
  const normalizedSpeed = typeof speedKmh === "number" && speedKmh > 2 ? speedKmh : 24;
  const etaMinutes = (distanceKmValue / normalizedSpeed) * 60;
  return Math.max(1, Math.round(etaMinutes));
}

function getLocationTarget(ride) {
  if (!ride) return null;
  if (ride.status === "accepted") return ride.pickup || null;
  if (ride.status === "in_progress" || ride.status === "ongoing") return ride.drop || null;
  return null;
}

function normalizeHeading(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function normalizeSpeed(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Number(value.toFixed(2));
}

async function processDriverLocationSocketUpdate(socket, payload) {
  if (socket.data.role !== ROLES.DRIVER || !socket.data.userId) {
    return;
  }

  const rideId = String(payload?.rideId || "").trim();
  const lat = Number(payload?.lat);
  const lng = Number(payload?.lng);

  if (!mongoose.Types.ObjectId.isValid(rideId)) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const nowMs = Date.now();
  const throttleKey = `${socket.id}:${rideId}`;
  const lastAt = socketLastDriverLocationAt.get(throttleKey) || 0;
  if (nowMs - lastAt < DRIVER_LOCATION_EVENT_INTERVAL_MS) {
    return;
  }
  socketLastDriverLocationAt.set(throttleKey, nowMs);

  const ride = await Ride.findById(rideId).select("_id studentId driverId status pickup drop sharedLinkToken").lean();
  if (!ride) return;

  const rideDriverId = ride.driverId?.toString?.() || "";
  if (rideDriverId !== socket.data.userId) {
    return;
  }

  if (!ONGOING_RIDE_STATUSES.includes(ride.status)) {
    return;
  }

  const heading = normalizeHeading(payload?.heading);
  const speed = normalizeSpeed(payload?.speed);
  const timestamp = payload?.timestamp ? new Date(payload.timestamp) : new Date(nowMs);
  const updatedAt = Number.isNaN(timestamp.getTime()) ? new Date(nowMs) : timestamp;

  await Ride.updateOne(
    { _id: ride._id },
    {
      $set: {
        driverLocation: {
          lat,
          lng,
          heading,
          speed,
          updatedAt,
        },
        updatedAt: new Date(nowMs),
      },
    },
  );

  await User.updateOne(
    { _id: new mongoose.Types.ObjectId(socket.data.userId) },
    {
      $set: {
        currentLocation: { lat, lng, updatedAt },
        currentLocationGeo: {
          type: "Point",
          coordinates: [lng, lat],
        },
        updatedAt: new Date(nowMs),
      },
    },
  );

  const target = getLocationTarget(ride);
  const etaDistanceKmRaw = distanceKm({ lat, lng }, target);
  const etaDistanceKm = typeof etaDistanceKmRaw === "number" ? Number(etaDistanceKmRaw.toFixed(2)) : null;
  const etaMinutes = estimateEtaMinutes(etaDistanceKmRaw, speed);

  const locationData = {
    driverId: socket.data.userId,
    rideId,
    lat,
    lng,
    heading,
    speed,
    timestamp: updatedAt.toISOString(),
    etaMinutes,
    etaDistanceKm,
    status: ride.status,
    mapMode: ride.status === "accepted" ? "driver_arriving" : ride.status === "in_progress" || ride.status === "ongoing" ? "ride_started" : "accepted",
  };

  io.to(`ride:${rideId}`).emit("driver-location", locationData);
  if (ride.studentId) {
    io.to(`user:${ride.studentId.toString()}`).emit("driver-location", locationData);
  }
  if (ride.sharedLinkToken) {
    io.to(`share:${ride.sharedLinkToken}`).emit("driver-location", locationData);
  }
}

export function initSocket(
  server,
  clientOrigins = [],
  nodeEnv = "development",
  allowLanOrigins = false,
  wildcardClientOriginPatterns = []
) {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (isTrustedVercelOrigin(origin)) {
          return callback(null, true);
        }
        if (isAllowedOrigin({
          origin,
          exactOrigins: clientOrigins,
          wildcardHostPatterns: wildcardClientOriginPatterns,
          nodeEnv,
          allowLanOrigins,
        })) {
          return callback(null, true);
        }
        return callback(createSocketCorsBlockedError(origin));
      },
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      socket.data.userId = null;
      socket.data.role = "guest";
      return next();
    }

    try {
      const payload = verifyJwt(token);
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      return next();
    } catch {
      return next(new Error("Invalid socket token"));
    }
  });

  io.on("connection", (socket) => {
    if (socket.data.userId) {
      const userRoom = `user:${socket.data.userId}`;
      const roleRoom = `role:${socket.data.role}`;
      socket.join(userRoom);
      socket.join(roleRoom);
    }

    socket.on("ride:join", (rideId) => {
      socket.join(`ride:${rideId}`);
    });

    socket.on("ride:leave", (rideId) => {
      socket.leave(`ride:${rideId}`);
    });

    socket.on("ride:join-share", (token) => {
      if (!token || typeof token !== "string" || token.length < 20) {
        return;
      }
      socket.join(`share:${token}`);
    });

    socket.on("ride:leave-share", (token) => {
      if (!token || typeof token !== "string") {
        return;
      }
      socket.leave(`share:${token}`);
    });

    socket.on("driver-location-update", (payload) => {
      void processDriverLocationSocketUpdate(socket, payload);
    });

    socket.on("disconnect", () => {
      for (const key of socketLastDriverLocationAt.keys()) {
        if (key.startsWith(`${socket.id}:`)) {
          socketLastDriverLocationAt.delete(key);
        }
      }
    });
  });

  return io;
}

export function getIo() {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
}

export function emitRideUpdate(ride) {
  if (!io) {
    return;
  }

  const rideId = ride?.id || ride?._id?.toString?.();
  if (!rideId) {
    return;
  }

  const studentId = ride?.studentId?.toString?.() || ride?.studentId || null;
  const driverId = ride?.driverId?.toString?.() || ride?.driverId || null;

  io.to(`ride:${rideId}`).emit("ride:updated", ride);

  if (studentId) {
    io.to(`user:${studentId}`).emit("ride:updated", ride);
  }
  if (driverId) {
    io.to(`user:${driverId}`).emit("ride:updated", ride);
  }

  if (ride?.driverLocation) {
    const locationData = {
      driverId,
      rideId,
      lat: ride.driverLocation.lat,
      lng: ride.driverLocation.lng,
      heading: ride.driverLocation.heading ?? null,
      speed: ride.driverLocation.speed ?? null,
      timestamp: ride.driverLocation.updatedAt || new Date().toISOString(),
      etaMinutes: ride.etaMinutes ?? null,
      etaDistanceKm: ride.etaDistanceKm ?? null,
      status: ride.status,
      mapMode: ride.status === "accepted" ? "driver_arriving" : ride.status === "in_progress" || ride.status === "ongoing" ? "ride_started" : "accepted",
    };
    io.to(`ride:${rideId}`).emit("driver-location", locationData);
  }

  if (ride?.sharedLinkToken) {
    io.to(`share:${ride.sharedLinkToken}`).emit("ride:tracking-update", {
      id: ride.id,
      status: ride.status,
      pickup: ride.pickup,
      drop: ride.drop,
      driver: ride.driver,
      driverLocation: ride.driverLocation,
      etaMinutes: ride.etaMinutes,
      etaDistanceKm: ride.etaDistanceKm,
      isDelayed: ride.isDelayed,
      delayReason: ride.delayReason,
      sharedLinkExpiresAt: ride.sharedLinkExpiresAt,
      timeline: ride.timeline || [],
    });
  }

  io.to("role:admin").emit("admin:ride-updated", ride);
  io.to("role:super_admin").emit("admin:ride-updated", ride);
  io.to("role:sub_admin").emit("admin:ride-updated", ride);
}

export function emitNewRideRequest(ride, onlineDriverIds = []) {
  if (!io) {
    return;
  }

  const uniqueDriverIds = [...new Set((onlineDriverIds || []).filter(Boolean).map((id) => String(id)))];

  if (uniqueDriverIds.length > 0) {
    for (const driverId of uniqueDriverIds) {
      io.to(`user:${driverId}`).emit("newRideRequest", ride);
      io.to(`user:${driverId}`).emit("ride:requested", ride);
    }
  } else {
    io.to("role:driver").emit("newRideRequest", ride);
    io.to("role:driver").emit("ride:requested", ride);
  }

  io.to("role:admin").emit("admin:ride-requested", ride);
  io.to("role:super_admin").emit("admin:ride-requested", ride);
  io.to("role:sub_admin").emit("admin:ride-requested", ride);
}

export function emitUserNotification(userId, notification) {
  if (!io || !userId) {
    return;
  }

  io.to(`user:${userId}`).emit("notification:new", notification);
}

export function emitAdminIssueCreated(issue) {
  if (!io || !issue) {
    return;
  }

  io.to("role:admin").emit("admin:issue-created", issue);
  io.to("role:super_admin").emit("admin:issue-created", issue);
  io.to("role:sub_admin").emit("admin:issue-created", issue);
}

export function emitAdminIssueUpdated(payload) {
  if (!io || !payload?.issue) {
    return;
  }

  io.to("role:admin").emit("admin:issue-updated", payload);
  io.to("role:super_admin").emit("admin:issue-updated", payload);
  io.to("role:sub_admin").emit("admin:issue-updated", payload);
}
