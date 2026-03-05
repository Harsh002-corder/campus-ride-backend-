import { Router } from "express";
import {
  deleteLegacy,
  findLegacy,
  findOneLegacy,
  insertLegacy,
  updateLegacy,
} from "../controllers/legacyController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

router.get("/:collection", findLegacy);
router.post("/:collection/findOne", findOneLegacy);
router.post("/:collection/insert", insertLegacy);
router.post("/:collection/update", updateLegacy);
router.post("/:collection/delete", deleteLegacy);

export default router;