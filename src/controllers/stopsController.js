import { CAMPUS_STOPS } from "../data/stops.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const suggestStops = asyncHandler(async (req, res) => {
  const query = String(req.query.q || "").trim().toLowerCase();
  const limit = Math.min(Number(req.query.limit || 8), 20);

  if (query.length < 2) {
    return res.json({ suggestions: [] });
  }

  const suggestions = CAMPUS_STOPS
    .filter((stop) => stop.name.toLowerCase().includes(query))
    .slice(0, limit);

  return res.json({ suggestions });
});
