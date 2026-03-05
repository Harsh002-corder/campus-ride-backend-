import { env } from "../config/env.js";
import { RateLimitBucket } from "../models/index.js";

export async function dbRateLimit(req, res, next) {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + env.rateLimitWindowMs);
  const routeKey = `${req.method}:${req.baseUrl}${req.path}`;
  const key = `${req.ip || "unknown"}:${routeKey}`;

  const bucket = await RateLimitBucket.findOne({ key }).lean();

  if (!bucket || bucket.windowEnd <= now) {
    await RateLimitBucket.updateOne(
      { key },
      {
        $set: {
          key,
          count: 1,
          routeKey,
          ip: req.ip || "unknown",
          windowStart: now,
          windowEnd,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    return next();
  }

  if (bucket.count >= env.rateLimitMax) {
    const retryAfter = Math.ceil((new Date(bucket.windowEnd).getTime() - now.getTime()) / 1000);
    res.set("Retry-After", String(Math.max(retryAfter, 1)));
    return res.status(429).json({ error: "Rate limit exceeded" });
  }

  await RateLimitBucket.updateOne(
    { key },
    { $inc: { count: 1 }, $set: { updatedAt: now } },
  );

  return next();
}