import { z } from "zod";
import { env } from "../config/env.js";
import { ALLOWED_ROLES, ROLES } from "../constants/roles.js";
import { PasswordResetOTP, SignupOTP, User } from "../models/index.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { signJwt } from "../utils/jwt.js";
import { generateOtp } from "../utils/otp.js";
import { comparePassword, hashPassword } from "../utils/password.js";
import { sendPasswordResetOtpEmail, sendSignupOtpEmail } from "../utils/mailer.js";

export const requestSignupOtpSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().transform((value) => value.toLowerCase().trim()),
  password: z.string().min(8).max(128),
  role: z.enum(ALLOWED_ROLES.filter((r) => r !== ROLES.ADMIN)),
  phone: z.string().min(7).max(20).optional(),
  driverSecurity: z
    .object({
      licenseNumber: z.string().min(5).max(40),
      vehicleNumber: z.string().min(5).max(20),
      emergencyContactName: z.string().min(2).max(120),
      emergencyContactPhone: z.string().min(7).max(20),
      idNumberLast4: z.string().regex(/^\d{4}$/),
    })
    .optional(),
}).superRefine((data, ctx) => {
  if (data.role === ROLES.DRIVER && !data.driverSecurity) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["driverSecurity"],
      message: "Driver security details are required",
    });
  }
});

export const verifySignupOtpSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase().trim()),
  role: z.enum(ALLOWED_ROLES.filter((r) => r !== ROLES.ADMIN)),
  otp: z.string().regex(/^\d{6}$/),
});

export const loginSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase().trim()),
  password: z.string().min(8).max(128),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase().trim()),
});

export const resetPasswordSchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase().trim()),
  otp: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8).max(128),
});

export const requestSignupOtp = asyncHandler(async (req, res) => {
  const { name, email, password, role, phone, driverSecurity } = req.body;
  const existingUser = await User.findOne({ email }).lean();
  if (existingUser) {
    throw new AppError(409, "An account with this email already exists");
  }

  const otp = generateOtp(6);
  const passwordHash = await hashPassword(password);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.otpTtlMinutes * 60 * 1000);

  await SignupOTP.updateMany(
    {
      email,
      role,
      consumed: false,
    },
    {
      $set: {
        consumed: true,
        consumedAt: now,
      },
    },
  );

  await SignupOTP.create({
    name,
    email,
    passwordHash,
    role,
    phone: phone || null,
    driverSecurity: role === ROLES.DRIVER ? driverSecurity : null,
    otp,
    consumed: false,
    createdAt: now,
    expiresAt,
  });

  const mailResult = await sendSignupOtpEmail({
    to: email,
    name,
    otp,
    expiresMinutes: env.otpTtlMinutes,
  });

  const responseBody = {
    message: "OTP generated",
    email,
    expiresAt,
  };

  if (!mailResult.sent) {
    if (env.nodeEnv === "production") {
      throw new AppError(500, `Failed to send OTP email: ${mailResult.reason}`);
    }

    responseBody.delivery = "email-not-configured";
    responseBody.deliveryReason = mailResult.reason;
    if (env.otpReturnInResponse || env.nodeEnv !== "production") {
      responseBody.otp = otp;
    }
  }

  res.status(201).json(responseBody);
});

export const verifySignupOtp = asyncHandler(async (req, res) => {
  const { email, role, otp } = req.body;
  const now = new Date();

  const otpDoc = await SignupOTP.findOne({
    email,
    role,
    otp,
    consumed: false,
    expiresAt: { $gt: now },
  });

  if (!otpDoc) {
    throw new AppError(400, "Invalid or expired OTP");
  }

  const existingUser = await User.findOne({ email }).lean();
  if (existingUser) {
    throw new AppError(409, "An account with this email already exists");
  }

  const userData = {
    name: otpDoc.name,
    email: otpDoc.email,
    phone: otpDoc.phone,
    driverSecurity: otpDoc.driverSecurity || null,
    passwordHash: otpDoc.passwordHash,
    role: otpDoc.role,
    isOnline: false,
    isActive: true,
    driverApprovalStatus: otpDoc.role === ROLES.DRIVER ? "pending" : "approved",
    driverVerificationStatus: otpDoc.role === ROLES.DRIVER ? "pending" : "approved",
    vehicleSeats: 4,
    driverPerformanceScore: 60,
    createdAt: now,
    updatedAt: now,
  };

  const user = await User.create(userData);
  await SignupOTP.updateOne({ _id: otpDoc._id }, { $set: { consumed: true, consumedAt: now } });

  if (user.role === ROLES.DRIVER && user.driverApprovalStatus !== "approved") {
    return res.status(201).json({
      message: "Signup completed. Your driver account is pending admin approval.",
      user: sanitizeUser(user),
    });
  }

  const token = signJwt({
    sub: user._id.toString(),
    role: user.role,
    email: user.email,
  });

  res.status(201).json({
    token,
    user: sanitizeUser(user),
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).lean();
  if (!user) {
    throw new AppError(401, "Invalid credentials");
  }

  const ok = await comparePassword(password, user.passwordHash || "");
  if (!ok) {
    throw new AppError(401, "Invalid credentials");
  }

  if (
    user.role === ROLES.DRIVER
    && (user.driverApprovalStatus !== "approved" || (user.driverVerificationStatus && user.driverVerificationStatus !== "approved"))
  ) {
    throw new AppError(403, "Driver account is pending admin approval");
  }

  const token = signJwt({
    sub: user._id.toString(),
    role: user.role,
    email: user.email,
  });

  await User.updateOne(
    { _id: user._id },
    { $set: { updatedAt: new Date(), lastLoginAt: new Date() } },
  );

  res.json({ token, user: sanitizeUser(user) });
});

export const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email }).lean();

  if (!user) {
    return res.status(200).json({
      message: "If this email exists, an OTP has been sent.",
      email,
    });
  }

  const otp = generateOtp(6);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.otpTtlMinutes * 60 * 1000);

  await PasswordResetOTP.create({
    email,
    otp,
    consumed: false,
    consumedAt: null,
    createdAt: now,
    expiresAt,
  });

  const mailResult = await sendPasswordResetOtpEmail({
    to: email,
    name: user.name,
    otp,
    expiresMinutes: env.otpTtlMinutes,
  });

  if (!mailResult.sent) {
    if (env.nodeEnv === "production") {
      throw new AppError(500, `Failed to send password reset OTP email: ${mailResult.reason}`);
    }

    const response = {
      message: "Password reset OTP generated",
      email,
      expiresAt,
      delivery: "email-not-configured",
      deliveryReason: mailResult.reason,
    };

    if (env.otpReturnInResponse || env.nodeEnv !== "production") {
      response.otp = otp;
    }

    return res.status(201).json(response);
  }

  return res.status(201).json({
    message: "Password reset OTP sent to email",
    email,
    expiresAt,
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const now = new Date();

  const otpDoc = await PasswordResetOTP.findOne({
    email,
    otp,
    consumed: false,
    expiresAt: { $gt: now },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!otpDoc) {
    throw new AppError(400, "Invalid or expired OTP");
  }

  const user = await User.findOne({ email }).lean();
  if (!user) {
    throw new AppError(404, "User not found");
  }

  const passwordHash = await hashPassword(newPassword);
  await User.updateOne(
    { _id: user._id },
    { $set: { passwordHash, updatedAt: now } },
  );

  await PasswordResetOTP.updateOne(
    { _id: otpDoc._id },
    { $set: { consumed: true, consumedAt: now } },
  );

  await PasswordResetOTP.updateMany(
    { email, consumed: false },
    { $set: { consumed: true, consumedAt: now } },
  );

  return res.json({ message: "Password reset successful" });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) {
    throw new AppError(404, "User not found");
  }
  res.json({ user: sanitizeUser(user) });
});

function sanitizeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    avatarUrl: user.avatarUrl || null,
    role: user.role,
    isOnline: Boolean(user.isOnline),
    isActive: user.isActive !== false,
    driverApprovalStatus: user.driverApprovalStatus || "approved",
    driverVerificationStatus: user.driverVerificationStatus || "pending",
    vehicleSeats: user.vehicleSeats || 4,
    driverPerformanceScore: user.driverPerformanceScore || 60,
    driverStats: user.driverStats || {},
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}