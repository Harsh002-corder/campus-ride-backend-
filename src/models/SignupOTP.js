import mongoose from "mongoose";

const signupOtpSchema = new mongoose.Schema(
  {
    name: { type: String },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true },
    phone: { type: String, default: null },
    otp: { type: String, required: true },
    consumed: { type: Boolean, default: false },
    consumedAt: { type: Date, default: null },
    createdAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  {
    collection: "signupotps",
    strict: false,
    versionKey: false,
  },
);

signupOtpSchema.index({ email: 1, role: 1, consumed: 1 });
signupOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SignupOTP = mongoose.models.SignupOTP || mongoose.model("SignupOTP", signupOtpSchema);