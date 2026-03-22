import mongoose from "mongoose";
import { Notification, User } from "../models/index.js";
import { emitUserNotification } from "./socket.js";
import { getFirebaseAdminMessaging } from "./firebaseAdmin.js";

const PUSH_RETRY_ATTEMPTS = 2;
const DEDUPE_WINDOW_MS = 20_000;

function buildRideRoute(rideId) {
  if (!rideId) {
    return "/rides";
  }
  return `/rides/${rideId}`;
}

function normalizeDataMap(data = {}) {
  const entries = Object.entries(data || {});
  const normalized = {};

  for (const [key, value] of entries) {
    if (value === undefined || value === null) {
      continue;
    }
    normalized[key] = typeof value === "string" ? value : String(value);
  }

  return normalized;
}

function toTokenList(user) {
  const raw = [
    ...(Array.isArray(user?.fcmTokens) ? user.fcmTokens : []),
    user?.fcmToken,
  ].filter(Boolean);

  return [...new Set(raw.map((token) => String(token).trim()).filter(Boolean))];
}

async function sendMulticastWithRetry({ tokens, title, body, data }) {
  const messaging = getFirebaseAdminMessaging();
  if (!messaging || !tokens.length) {
    return { ok: false, sentCount: 0, invalidTokens: [] };
  }

  const payload = {
    tokens,
    notification: { title, body },
    data: normalizeDataMap(data),
    webpush: {
      fcmOptions: {
        link: data?.url || "/rides",
      },
      notification: {
        icon: "/icons/favicon-192.png",
        badge: "/icons/favicon-192.png",
      },
      headers: {
        Urgency: "high",
      },
    },
  };

  let response = null;
  for (let attempt = 1; attempt <= PUSH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      response = await messaging.sendEachForMulticast(payload);
      break;
    } catch (error) {
      if (attempt >= PUSH_RETRY_ATTEMPTS) {
        console.error("[push] sendEachForMulticast failed", { error: error?.message || error });
        return { ok: false, sentCount: 0, invalidTokens: [] };
      }
    }
  }

  if (!response) {
    return { ok: false, sentCount: 0, invalidTokens: [] };
  }

  const invalidTokens = [];
  response.responses.forEach((item, index) => {
    if (item.success) return;
    const code = item.error?.code || "";
    if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
      invalidTokens.push(tokens[index]);
    }
  });

  return {
    ok: true,
    sentCount: response.successCount,
    invalidTokens,
  };
}

async function removeInvalidUserTokens(userId, invalidTokens) {
  if (!userId || !invalidTokens?.length) {
    return;
  }

  await User.updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    {
      $pull: { fcmTokens: { $in: invalidTokens } },
      $set: { updatedAt: new Date() },
    },
  );

  const user = await User.findById(userId).select("fcmToken").lean();
  if (user?.fcmToken && invalidTokens.includes(user.fcmToken)) {
    await User.updateOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { $set: { fcmToken: null, updatedAt: new Date() } },
    );
  }
}

export async function sendNotification(userId, title, body, data = {}) {
  if (!userId || !title || !body) {
    return { ok: false, sentCount: 0 };
  }

  const user = await User.findById(userId).select("fcmToken fcmTokens").lean();
  if (!user) {
    return { ok: false, sentCount: 0 };
  }

  const tokens = toTokenList(user);
  if (!tokens.length) {
    return { ok: false, sentCount: 0 };
  }

  const result = await sendMulticastWithRetry({ tokens, title, body, data });
  if (result.invalidTokens?.length) {
    await removeInvalidUserTokens(userId, result.invalidTokens);
  }

  return result;
}

function createRideDedupeKey(userId, rideId, type, suffix = "") {
  const keyPart = [userId, rideId, type, suffix].filter(Boolean).join(":");
  return keyPart || null;
}

export async function createNotification({ userId, type = "ride_update", title, body, data = {}, dedupeKey = null, sendPush = true }) {
  if (!userId || !title || !body) {
    return null;
  }

  if (dedupeKey) {
    const recentlyCreated = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const duplicate = await Notification.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      dedupeKey,
      createdAt: { $gte: recentlyCreated },
    }).lean();

    if (duplicate) {
      return {
        id: duplicate._id.toString(),
        userId: duplicate.userId.toString(),
        type: duplicate.type,
        title: duplicate.title,
        body: duplicate.body,
        data: duplicate.data,
        readAt: duplicate.readAt,
        createdAt: duplicate.createdAt,
      };
    }
  }

  const notification = await Notification.create({
    userId: new mongoose.Types.ObjectId(userId),
    type,
    title,
    body,
    data,
    dedupeKey,
    createdAt: new Date(),
  });

  const serialized = {
    id: notification._id.toString(),
    userId: notification.userId.toString(),
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  };

  emitUserNotification(userId, serialized);

  if (sendPush) {
    await sendNotification(userId, title, body, {
      ...data,
      notificationId: serialized.id,
      type,
    });
  }

  return serialized;
}

export async function createRideStatusNotifications(ride) {
  if (!ride) return;

  const rideId = ride.id || ride._id?.toString?.();
  const status = String(ride.status || "").toLowerCase();
  const route = buildRideRoute(rideId);

  if (!rideId || !status) {
    return;
  }

  if (status === "accepted" && ride.studentId) {
    await createNotification({
      userId: ride.studentId,
      type: "ride_accepted",
      title: "Driver accepted your ride",
      body: "Your driver is on the way to pickup.",
      data: { rideId, status, url: route },
      dedupeKey: createRideDedupeKey(ride.studentId, rideId, "ride_accepted"),
    });
  }

  if ((status === "in_progress" || status === "ongoing") && ride.studentId) {
    await createNotification({
      userId: ride.studentId,
      type: "ride_started",
      title: "Ride started",
      body: "Your ride has started. Have a safe trip.",
      data: { rideId, status, url: route },
      dedupeKey: createRideDedupeKey(ride.studentId, rideId, "ride_started"),
    });
  }

  if (status === "completed" && ride.studentId) {
    await createNotification({
      userId: ride.studentId,
      type: "ride_completed",
      title: "Ride completed",
      body: "Your trip has been completed successfully.",
      data: { rideId, status, url: route },
      dedupeKey: createRideDedupeKey(ride.studentId, rideId, "ride_completed"),
    });
  }

  if (status === "cancelled") {
    const cancelledBy = String(ride.cancelledBy || "").toLowerCase();

    if (ride.studentId) {
      const userTitle = cancelledBy === "driver" ? "Driver cancelled the ride" : "Ride cancelled";
      const userBody = cancelledBy === "driver"
        ? "Your driver cancelled this ride. Please request another ride."
        : "Your ride was cancelled.";

      await createNotification({
        userId: ride.studentId,
        type: "ride_cancelled",
        title: userTitle,
        body: userBody,
        data: { rideId, status, cancelledBy, url: route },
        dedupeKey: createRideDedupeKey(ride.studentId, rideId, "ride_cancelled", cancelledBy),
      });
    }

    if (ride.driverId && cancelledBy === "student") {
      await createNotification({
        userId: ride.driverId,
        type: "ride_cancelled_by_user",
        title: "User cancelled the ride",
        body: "The rider cancelled this trip.",
        data: { rideId, status, cancelledBy, url: route },
        dedupeKey: createRideDedupeKey(ride.driverId, rideId, "ride_cancelled_by_user", cancelledBy),
      });
    }
  }

  await createRoleNotifications({
    role: "admin",
    type: "ride_status_admin",
    title: `Ride ${status}`,
    body: `Ride ${rideId} moved to ${status}.`,
    data: { rideId, status, url: route },
    sendPush: false,
  });
}

export async function createRideArrivedNotification(ride) {
  const rideId = ride?.id || ride?._id?.toString?.();
  if (!rideId || !ride?.studentId) {
    return null;
  }

  return createNotification({
    userId: ride.studentId,
    type: "ride_arrived",
    title: "Driver has arrived",
    body: "Your driver has arrived at pickup location.",
    data: { rideId, status: "arrived", url: buildRideRoute(rideId) },
    dedupeKey: createRideDedupeKey(ride.studentId, rideId, "ride_arrived"),
  });
}

export async function notifyDriversNewRideRequest(ride, driverIds = []) {
  const rideId = ride?.id || ride?._id?.toString?.();
  if (!rideId) {
    return [];
  }

  const pickupLabel = ride?.pickup?.label || "Pickup";
  const dropLabel = ride?.drop?.label || "Drop";
  const body = `${pickupLabel} -> ${dropLabel}`;
  const data = {
    rideId,
    status: ride?.status || "pending",
    pickup: pickupLabel,
    drop: dropLabel,
    url: buildRideRoute(rideId),
  };

  const uniqueDriverIds = [...new Set((driverIds || []).filter(Boolean).map((id) => String(id)))];
  const notifications = [];

  for (const driverId of uniqueDriverIds) {
    const created = await createNotification({
      userId: driverId,
      type: "ride_request",
      title: "New ride request nearby",
      body,
      data,
      dedupeKey: createRideDedupeKey(driverId, rideId, "ride_request"),
    });

    if (created) {
      notifications.push(created);
    }
  }

  return notifications;
}

export async function sendTestUserNotification(userId) {
  if (!userId) {
    return null;
  }

  return createNotification({
    userId,
    type: "test",
    title: "Test Notification",
    body: "Push notifications are configured successfully.",
    data: { url: "/rides", source: "test" },
    dedupeKey: createRideDedupeKey(userId, "test", "test", String(Date.now())),
  });
}

export async function createRoleNotifications({ role, type = "system", title, body, data = {}, sendPush = true }) {
  if (!role || !title || !body) {
    return [];
  }

  const users = await User.find({ role, isActive: { $ne: false } }).select("_id").lean();
  if (!users.length) {
    return [];
  }

  const now = new Date();
  const docs = users.map((user) => ({
    userId: user._id,
    type,
    title,
    body,
    data,
    dedupeKey: null,
    createdAt: now,
  }));

  const inserted = await Notification.insertMany(docs, { ordered: false });
  const serialized = inserted.map((notification) => ({
    id: notification._id.toString(),
    userId: notification.userId.toString(),
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data,
    readAt: notification.readAt,
    createdAt: notification.createdAt,
  }));

  serialized.forEach((notification) => {
    emitUserNotification(notification.userId, notification);
  });

  if (sendPush) {
    await Promise.allSettled(
      serialized.map((notification) => sendNotification(notification.userId, notification.title, notification.body, {
        ...notification.data,
        notificationId: notification.id,
      })),
    );
  }

  return serialized;
}
