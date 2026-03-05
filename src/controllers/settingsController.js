import { z } from "zod";
import { Setting } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const updateSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.any(),
  description: z.string().max(240).optional(),
});

export const listSettings = asyncHandler(async (_req, res) => {
  const settings = await Setting.find({}).sort({ key: 1 }).lean();
  res.json({
    settings: settings.map((setting) => ({
      id: setting._id.toString(),
      key: setting.key,
      value: setting.value,
      description: setting.description || null,
      updatedAt: setting.updatedAt || null,
    })),
  });
});

export const upsertSetting = asyncHandler(async (req, res) => {
  const now = new Date();

  await Setting.updateOne(
    { key: req.body.key },
    {
      $set: {
        key: req.body.key,
        value: req.body.value,
        description: req.body.description || null,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  const setting = await Setting.findOne({ key: req.body.key }).lean();
  res.json({
    setting: {
      id: setting._id.toString(),
      key: setting.key,
      value: setting.value,
      description: setting.description || null,
      updatedAt: setting.updatedAt || null,
    },
  });
});