import { Router } from "express";
import {
  getMyVerificationStatus,
  listOnlineDrivers,
  setDriverLocation,
  setDriverLocationSchema,
  setDriverOnline,
  setDriverOnlineSchema,
  uploadVerificationDocument,
  uploadVerificationSchema,
} from "../controllers/driversController.js";
import { ROLES } from "../constants/roles.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.get("/online", requireAuth, listOnlineDrivers);
router.patch("/me/online", requireAuth, requireRole(ROLES.DRIVER), validate(setDriverOnlineSchema), setDriverOnline);
router.patch("/me/location", requireAuth, requireRole(ROLES.DRIVER), validate(setDriverLocationSchema), setDriverLocation);
router.get("/me/verification", requireAuth, requireRole(ROLES.DRIVER), getMyVerificationStatus);
router.post("/me/verification", requireAuth, requireRole(ROLES.DRIVER), validate(uploadVerificationSchema), uploadVerificationDocument);

export default router;