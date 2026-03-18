import mongoose from "mongoose";

const issueSchema = new mongoose.Schema(
  {
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: "Ride", required: true },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reporterRole: { type: String, enum: ["student", "driver"], required: true },
    category: {
      type: String,
      enum: ["overcharge", "driver_behavior", "route_issue", "safety", "app_issue", "other"],
      required: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 600 },
    status: { type: String, enum: ["open", "in_review", "resolved", "rejected"], default: "open" },
    resolutionNote: { type: String, default: "", trim: true, maxlength: 600 },
    assignedAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  {
    collection: "issues",
    strict: false,
    versionKey: false,
  },
);

issueSchema.index({ reporterId: 1, createdAt: -1 });
issueSchema.index({ status: 1, createdAt: -1 });
issueSchema.index({ category: 1, createdAt: -1 });

export const Issue = mongoose.models.Issue || mongoose.model("Issue", issueSchema);
