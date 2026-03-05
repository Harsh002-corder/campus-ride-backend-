import { Router } from "express";
import { listSettings, updateSettingSchema, upsertSetting } from "../controllers/settingsController.js";
import { ROLES } from "../constants/roles.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.get("/", requireAuth, listSettings);
router.put("/", requireAuth, requireRole(ROLES.ADMIN), validate(updateSettingSchema), upsertSetting);

export default router;