import mongoose from "mongoose";

const favoriteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, required: true, trim: true },
    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      address: { type: String, default: "" },
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "favorites",
    versionKey: false,
  },
);

favoriteSchema.index({ userId: 1, label: 1 }, { unique: true });

export const Favorite = mongoose.models.Favorite || mongoose.model("Favorite", favoriteSchema);
