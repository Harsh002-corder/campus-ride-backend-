import mongoose from "mongoose";

const driverSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    licenseNumber: { type: String, default: null },
    vehicleNumber: { type: String, default: null },
    seatsAvailable: { type: Number, default: 4 },
    ratingAverage: { type: Number, default: 4.5 },
    completedRides: { type: Number, default: 0 },
    currentLocation: {
      lat: { type: Number },
      lng: { type: Number },
      updatedAt: { type: Date },
    },
    preferredRoute: {
      pickup: {
        lat: { type: Number },
        lng: { type: Number },
      },
      drop: {
        lat: { type: Number },
        lng: { type: Number },
      },
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "drivers",
    versionKey: false,
  },
);

driverSchema.index({ "currentLocation.lat": 1, "currentLocation.lng": 1 });

export const Driver = mongoose.models.Driver || mongoose.model("Driver", driverSchema);
