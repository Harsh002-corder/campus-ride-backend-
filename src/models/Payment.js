import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    method: { type: String, default: "cash" },
    status: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    transactionId: { type: String, default: null },
    paidAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "payments",
    versionKey: false,
  },
);

paymentSchema.index({ rideId: 1 });
paymentSchema.index({ studentId: 1, createdAt: -1 });
paymentSchema.index({ driverId: 1, createdAt: -1 });

export const Payment = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
