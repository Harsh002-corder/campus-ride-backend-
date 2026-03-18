import { Router } from "express";
import {
  createCollege,
  createCollegeSchema,
  getMyCollege,
  listColleges,
  listPublicColleges,
  updateCollege,
  updateCollegeSchema,
} from "../controllers/collegesController.js";
import { ADMIN_DASHBOARD_ROLES } from "../constants/roles.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.get("/public", listPublicColleges);
router.get("/", requireAuth, requireRole(...ADMIN_DASHBOARD_ROLES), listColleges);
router.get("/my", requireAuth, requireRole(...ADMIN_DASHBOARD_ROLES), getMyCollege);
router.post("/", requireAuth, requireRole(...ADMIN_DASHBOARD_ROLES), validate(createCollegeSchema), createCollege);
router.patch("/:collegeId", requireAuth, requireRole(...ADMIN_DASHBOARD_ROLES), validate(updateCollegeSchema), updateCollege);

export default router;
