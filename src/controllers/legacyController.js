import { z } from "zod";
import { getDb } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const collectionParamSchema = z.object({
  collection: z.string().min(1),
});

export const findLegacy = asyncHandler(async (req, res) => {
  const db = getDb();
  const collection = req.params.collection;
  const col = db.collection(collection);

  const filterParam = req.query.filter;
  const filter = typeof filterParam === "string" ? JSON.parse(filterParam) : {};
  const limit = Number(req.query.limit || 100);

  const docs = await col.find(filter).limit(Math.min(limit, 500)).toArray();
  res.json(docs);
});

export const findOneLegacy = asyncHandler(async (req, res) => {
  const db = getDb();
  const col = db.collection(req.params.collection);
  const doc = await col.findOne(req.body.filter || {});
  res.json(doc);
});

export const insertLegacy = asyncHandler(async (req, res) => {
  const db = getDb();
  const col = db.collection(req.params.collection);
  const now = new Date();

  if (Array.isArray(req.body)) {
    const docs = req.body.map((item) => ({ ...item, createdAt: item.createdAt || now, updatedAt: now }));
    const result = await col.insertMany(docs);
    return res.json({ insertedCount: result.insertedCount });
  }

  const doc = { ...req.body, createdAt: req.body.createdAt || now, updatedAt: now };
  const result = await col.insertOne(doc);
  return res.json({ insertedId: result.insertedId });
});

export const updateLegacy = asyncHandler(async (req, res) => {
  const db = getDb();
  const col = db.collection(req.params.collection);
  const { filter = {}, update = {} } = req.body;

  if (typeof update !== "object" || update === null) {
    throw new AppError(400, "Invalid update payload");
  }

  const normalizedUpdate = Object.keys(update).some((key) => key.startsWith("$"))
    ? update
    : { $set: update };

  const result = await col.updateMany(filter, {
    ...normalizedUpdate,
    $set: {
      ...(normalizedUpdate.$set || {}),
      updatedAt: new Date(),
    },
  });

  res.json({ matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
});

export const deleteLegacy = asyncHandler(async (req, res) => {
  const db = getDb();
  const col = db.collection(req.params.collection);
  const { filter = {} } = req.body;
  const result = await col.deleteMany(filter);
  res.json({ deletedCount: result.deletedCount });
});
