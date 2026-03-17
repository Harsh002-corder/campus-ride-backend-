import { Router } from "express";
import { listSettings, updateSettingSchema, upsertSetting } from "../controllers/settingsController.js";
import { ADMIN_DASHBOARD_ROLES } from "../constants/roles.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.get("/", requireAuth, listSettings);
router.put("/", requireAuth, requireRole(...ADMIN_DASHBOARD_ROLES), validate(updateSettingSchema), upsertSetting);

export default router;