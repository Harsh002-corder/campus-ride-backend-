import mongoose from "mongoose";
import { Notification, User } from "../models/index.js";
import { emitUserNotification } from "./socket.js";

export async function createNotification({ userId, type = "ride_update", title, body, data = {} }) {
  if (!userId || !title || !body) {
    return null;
  }

  const notification = await Notification.create({
    userId: new mongoose.Types.ObjectId(userId),
    type,
    title,
    body,
    data,
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
  return serialized;
}

export async function createRideStatusNotifications(ride) {
  if (!ride) return;

  const titleByStatus = {
    pending: "Ride Requested",
    requested: "Ride Requested",
    accepted: "Ride Accepted",
    in_progress: "Ride Started",
    ongoing: "Ride Started",
    completed: "Ride Completed",
    cancelled: "Ride Cancelled",
  };

  const title = titleByStatus[ride.status] || "Ride Updated";
  const body = `Ride ${ride.id} is now ${ride.status}.`;

  const payload = {
    type: "ride_status",
    title,
    body,
    data: { rideId: ride.id, status: ride.status },
  };

  if (ride.studentId) {
    await createNotification({ ...payload, userId: ride.studentId });
  }

  if (ride.driverId) {
    await createNotification({ ...payload, userId: ride.driverId });
  }

  await createRoleNotifications({
    role: "admin",
    type: "ride_status_admin",
    title: `Ride ${ride.status}`,
    body: `Ride ${ride.id} moved to ${ride.status}.`,
    data: { rideId: ride.id, status: ride.status },
  });
}

export async function createRoleNotifications({ role, type = "system", title, body, data = {} }) {
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

  return serialized;
}
