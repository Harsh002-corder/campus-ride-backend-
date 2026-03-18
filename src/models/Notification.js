import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, default: "ride_update" },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: Object, default: {} },
    readAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "notifications",
    versionKey: false,
  },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });

export const Notification = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
