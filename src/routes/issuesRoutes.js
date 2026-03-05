import { Router } from "express";
import { createIssue, createIssueSchema, listMyIssues } from "../controllers/issuesController.js";
import { ROLES } from "../constants/roles.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.use(requireAuth);

router.get("/my", listMyIssues);
router.post("/", requireRole(ROLES.STUDENT), validate(createIssueSchema), createIssue);

export default router;
