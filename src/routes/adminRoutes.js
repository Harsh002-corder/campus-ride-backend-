import { Router } from "express";
import { getDashboardAnalytics, getFilteredRides, getScheduledRideQueue } from "../controllers/adminController.js";
import { listVerificationRequests, reviewVerification, reviewVerificationSchema } from "../controllers/driversController.js";
import { listAdminIssues, updateIssueSchema, updateIssueStatus } from "../controllers/issuesController.js";
import { ROLES } from "../constants/roles.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.use(requireAuth, requireRole(ROLES.ADMIN));

router.get("/analytics", getDashboardAnalytics);
router.get("/rides", getFilteredRides);
router.get("/scheduled-rides", getScheduledRideQueue);
router.get("/issues", listAdminIssues);
router.patch("/issues/:issueId", validate(updateIssueSchema), updateIssueStatus);
router.get("/verifications", listVerificationRequests);
router.patch("/verifications/:verificationId", validate(reviewVerificationSchema), reviewVerification);

export default router;