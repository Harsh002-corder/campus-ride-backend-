import mongoose from "mongoose";

const rateLimitBucketSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    count: { type: Number, default: 0 },
    routeKey: { type: String },
    ip: { type: String },
    windowStart: { type: Date },
    windowEnd: { type: Date, required: true },
    updatedAt: { type: Date },
  },
  {
    collection: "ratelimitbuckets",
    strict: false,
    versionKey: false,
  },
);

rateLimitBucketSchema.index({ key: 1 }, { unique: true });
rateLimitBucketSchema.index({ windowEnd: 1 });

export const RateLimitBucket = mongoose.models.RateLimitBucket || mongoose.model("RateLimitBucket", rateLimitBucketSchema);