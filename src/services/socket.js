import { Server } from "socket.io";
import { verifyJwt } from "../utils/jwt.js";
import { isAllowedOrigin } from "../utils/originMatcher.js";

let io;

function createSocketCorsBlockedError(origin) {
  const error = new Error(`Socket CORS blocked for origin: ${origin}`);
  error.statusCode = 403;
  error.code = "SOCKET_CORS_FORBIDDEN";
  return error;
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
}

export function emitNewRideRequest(ride) {
  if (!io) {
    return;
  }
  io.to("role:driver").emit("ride:requested", ride);
  io.to("role:admin").emit("admin:ride-requested", ride);
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
}

export function emitAdminIssueUpdated(payload) {
  if (!io || !payload?.issue) {
    return;
  }

  io.to("role:admin").emit("admin:issue-updated", payload);
}