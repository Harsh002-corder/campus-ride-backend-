import { AppError } from "../utils/AppError.js";

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, "Route not found"));
}

export function errorHandler(err, _req, res, _next) {
  const statusCode = err instanceof AppError
    ? err.statusCode
    : Number(err?.statusCode || err?.status || 500);
  const message = err?.message || "Internal server error";
  const details = err instanceof AppError ? err.details : undefined;

  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json({
    error: message,
    ...(details ? { details } : {}),
  });
}