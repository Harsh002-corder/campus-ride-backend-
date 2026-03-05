import mongoose from "mongoose";

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed },
    description: { type: String, default: null },
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  {
    collection: "settings",
    strict: false,
    versionKey: false,
  },
);

settingSchema.index({ key: 1 }, { unique: true });

export const Setting = mongoose.models.Setting || mongoose.model("Setting", settingSchema);