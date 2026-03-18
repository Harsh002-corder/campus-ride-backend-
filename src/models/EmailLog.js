import mongoose from "mongoose";

const emailLogSchema = new mongoose.Schema(
  {
    to: { type: String, required: true, trim: true, lowercase: true },
    subject: { type: String, required: true },
    type: { type: String, default: "general" },
    status: { type: String, enum: ["sent", "failed", "skipped"], default: "sent" },
    reason: { type: String, default: "" },
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", default: null },
    metadata: { type: Object, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "emailLogs",
    versionKey: false,
  },
);

emailLogSchema.index({ to: 1, createdAt: -1 });
emailLogSchema.index({ type: 1, createdAt: -1 });

export const EmailLog = mongoose.models.EmailLog || mongoose.model("EmailLog", emailLogSchema);
