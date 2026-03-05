import mongoose from "mongoose";

const cancellationSchema = new mongoose.Schema(
  {
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", required: true, index: true },
    cancelledByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    cancelledByRole: { type: String, enum: ["student", "driver", "admin"], required: true },
    reasonKey: { type: String, required: true },
    customReason: { type: String, default: "" },
    reasonText: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "cancellations",
    versionKey: false,
  },
);

cancellationSchema.index({ createdAt: -1 });
cancellationSchema.index({ reasonKey: 1, createdAt: -1 });

export const Cancellation = mongoose.models.Cancellation || mongoose.model("Cancellation", cancellationSchema);
