import mongoose from "mongoose";

const verificationDocumentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["license", "id_proof", "vehicle_rc"], required: true },
    url: { type: String, required: true },
    fileName: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const verificationSchema = new mongoose.Schema(
  {
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    documents: { type: [verificationDocumentSchema], default: [] },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    reviewNotes: { type: String, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: "verifications",
    versionKey: false,
  },
);

verificationSchema.index({ status: 1, updatedAt: -1 });

export const Verification = mongoose.models.Verification || mongoose.model("Verification", verificationSchema);
