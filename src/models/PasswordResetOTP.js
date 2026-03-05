import mongoose from "mongoose";

const passwordResetOtpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    otp: { type: String, required: true },
    consumed: { type: Boolean, default: false },
    consumedAt: { type: Date, default: null },
    createdAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  {
    collection: "passwordresetotps",
    strict: false,
    versionKey: false,
  },
);

passwordResetOtpSchema.index({ email: 1, consumed: 1, createdAt: -1 });
passwordResetOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetOTP =
  mongoose.models.PasswordResetOTP || mongoose.model("PasswordResetOTP", passwordResetOtpSchema);
