import { CAMPUS_STOPS } from "../data/stops.js";
import { Setting } from "../models/index.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function normalizeStopList(value, fallback = CAMPUS_STOPS) {
  if (!Array.isArray(value)) return fallback;

  const normalized = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = String(item.name || "").trim();
      const lat = Number(item.lat);
      const lng = Number(item.lng);
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { name, lat, lng };
    })
    .filter(Boolean);

  return normalized.length > 0 ? normalized : fallback;
}

export const suggestStops = asyncHandler(async (req, res) => {
  const query = String(req.query.q || "").trim().toLowerCase();
  const limit = Math.min(Number(req.query.limit || 8), 20);

  if (query.length < 2) {
    return res.json({ suggestions: [] });
  }

  const row = await Setting.findOne({ key: "ride_pickup_drop_stops" }).lean();
  const stopList = normalizeStopList(row?.value, CAMPUS_STOPS);

  const suggestions = stopList
    .filter((stop) => stop.name.toLowerCase().includes(query))
    .slice(0, limit);

  return res.json({ suggestions });
});
