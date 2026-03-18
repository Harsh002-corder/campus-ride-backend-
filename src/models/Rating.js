import mongoose from "mongoose";

const ratingSchema = new mongoose.Schema(
  {
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", required: true },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    score: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "ratings",
    versionKey: false,
  },
);

ratingSchema.index({ toUserId: 1, createdAt: -1 });
ratingSchema.index({ rideId: 1 }, { unique: true });

export const Rating = mongoose.models.Rating || mongoose.model("Rating", ratingSchema);
