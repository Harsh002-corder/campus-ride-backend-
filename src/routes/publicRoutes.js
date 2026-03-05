import { Router } from "express";
import { getRideByShareToken } from "../controllers/ridesController.js";

const router = Router();

router.get("/rides/:token", getRideByShareToken);

export default router;
