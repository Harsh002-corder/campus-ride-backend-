import mongoose from "mongoose";
import { Notification } from "../models/index.js";
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
  const notifications = await Notification.find({ userId: new mongoose.Types.ObjectId(req.user.id) })
    .sort({ createdAt: -1 })
    .limit(100)
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
