import mongoose from "mongoose";

const boundaryPointSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false },
);

const collegeConfigSchema = new mongoose.Schema(
  {
    baseFare: { type: Number, default: null },
    perKmRate: { type: Number, default: null },
    perMinuteRate: { type: Number, default: null },
    minimumFare: { type: Number, default: null },
    platformFeePercent: { type: Number, default: null },
    maxPassengers: { type: Number, default: null },
    matchingRadiusKm: { type: Number, default: null },
  },
  { _id: false },
);

const collegeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      address: { type: String, default: "" },
    },
    boundaryPolygon: { type: [boundaryPointSchema], default: [] },
    subAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    config: { type: collegeConfigSchema, default: {} },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "colleges",
    versionKey: false,
  },
);

collegeSchema.index({ code: 1 }, { unique: true });
collegeSchema.index({ status: 1, updatedAt: -1 });
collegeSchema.index({ subAdminId: 1 });

export const College = mongoose.models.College || mongoose.model("College", collegeSchema);