import { Router } from "express";
import { suggestStops } from "../controllers/stopsController.js";

const router = Router();

router.get("/suggest", suggestStops);

export default router;
