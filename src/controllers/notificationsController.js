import mongoose from "mongoose";
import { z } from "zod";
import { Notification } from "../models/index.js";
import { User } from "../models/index.js";
import { sendTestUserNotification } from "../services/notificationService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function serializeNotification(notification) {
  return {
    id: notification._id.toString(),
    userId: notification.userId.toString(),
    type: notification.type,
    title: notification.title,
    body: notification.body,
    data: notification.data || {},
    readAt: notification.readAt || null,
    createdAt: notification.createdAt,
  };
}

export const listMyNotifications = asyncHandler(async (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));

  const notifications = await Notification.find({ userId: new mongoose.Types.ObjectId(req.user.id) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({ notifications: notifications.map(serializeNotification) });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const notificationId = new mongoose.Types.ObjectId(req.params.notificationId);
  const updated = await Notification.findOneAndUpdate(
    {
      _id: notificationId,
      userId: new mongoose.Types.ObjectId(req.user.id),
    },
    {
      $set: {
        readAt: new Date(),
      },
    },
    { new: true, lean: true },
  );

  if (!updated) {
    return res.status(404).json({ error: "Notification not found" });
  }

  res.json({ notification: serializeNotification(updated) });
});

export const registerPushTokenSchema = z.object({
  token: z.string().min(20).max(4096),
  platform: z.string().max(40).optional().default("web"),
});

export const removePushTokenSchema = z.object({
  token: z.string().min(20).max(4096),
});

export const registerPushToken = asyncHandler(async (req, res) => {
  const now = new Date();
  const token = String(req.body.token || "").trim();

  await User.updateOne(
    { _id: new mongoose.Types.ObjectId(req.user.id) },
    {
      $set: {
        fcmToken: token,
        updatedAt: now,
      },
      $addToSet: {
        fcmTokens: token,
      },
    },
  );

  res.json({ ok: true });
});

export const removePushToken = asyncHandler(async (req, res) => {
  const token = String(req.body.token || "").trim();
  const now = new Date();

  await User.updateOne(
    { _id: new mongoose.Types.ObjectId(req.user.id) },
    {
      $pull: { fcmTokens: token },
      $set: { updatedAt: now },
    },
  );

  const user = await User.findById(req.user.id).select("fcmToken").lean();
  if (user?.fcmToken === token) {
    await User.updateOne(
      { _id: new mongoose.Types.ObjectId(req.user.id) },
      { $set: { fcmToken: null, updatedAt: now } },
    );
  }

  res.json({ ok: true });
});

export const sendTestNotification = asyncHandler(async (req, res) => {
  const notification = await sendTestUserNotification(req.user.id);
  res.json({ ok: true, notification });
});
