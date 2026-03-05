import mongoose from "mongoose";
import { User } from "../models/index.js";
import { verifyJwt } from "../utils/jwt.js";
import { AppError } from "../utils/AppError.js";

export async function requireAuth(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return next(new AppError(401, "Missing Bearer token"));
  }

  try {
    const token = authHeader.slice("Bearer ".length);
    const payload = verifyJwt(token);
    if (!mongoose.Types.ObjectId.isValid(payload.sub)) {
      return next(new AppError(401, "Invalid token subject"));
    }

    const user = await User.findById(payload.sub).lean();

    if (!user) {
      return next(new AppError(401, "User not found for token"));
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
      driverApprovalStatus: user.driverApprovalStatus,
    };

    return next();
  } catch {
    return next(new AppError(401, "Invalid or expired token"));
  }
}

export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError(401, "Unauthorized"));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError(403, "Forbidden: role mismatch"));
    }
    return next();
  };
}