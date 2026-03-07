import { Router } from "express";
import {
  acceptRide,
  bookRide,
  bookRideSchema,
  cancelRide,
  cancelRideSchema,
  completeRide,
  downloadRideInvoice,
  driverLocationSchema,
  estimateFare,
  fareEstimateSchema,
  getRideById,
  listRideHistory,
  listAvailableRides,
  listMyRides,
  quickBookRide,
  quickBookRideSchema,
  rejectRide,
  rideFeedbackSchema,
  startRide,
  submitRideFeedback,
  updateDriverLocation,
  verifyRideSchema,
  verifyRideStart,
} from "../controllers/ridesController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ROLES } from "../constants/roles.js";

const router = Router();

router.use(requireAuth);

router.post("/", requireRole(ROLES.STUDENT), validate(bookRideSchema), bookRide);
router.post("/quick-book", requireRole(ROLES.STUDENT), validate(quickBookRideSchema), quickBookRide);
router.post("/fare-estimate", requireRole(ROLES.STUDENT), validate(fareEstimateSchema), estimateFare);
router.get("/my", listMyRides);
router.get("/history", listRideHistory);
router.get("/available", requireRole(ROLES.DRIVER), listAvailableRides);
router.get("/:rideId", getRideById);
router.get("/:rideId/invoice", downloadRideInvoice);
router.post("/:rideId/accept", requireRole(ROLES.DRIVER), acceptRide);
router.post("/:rideId/reject", requireRole(ROLES.DRIVER), rejectRide);
router.post("/:rideId/deny", requireRole(ROLES.DRIVER), rejectRide);
router.post("/:rideId/start", requireRole(ROLES.DRIVER), startRide);
router.post("/:rideId/verify", requireRole(ROLES.DRIVER), validate(verifyRideSchema), verifyRideStart);
router.post("/:rideId/complete", requireRole(ROLES.DRIVER), completeRide);
router.post("/:rideId/feedback", requireRole(ROLES.STUDENT), validate(rideFeedbackSchema), submitRideFeedback);
router.post("/:rideId/cancel", validate(cancelRideSchema), cancelRide);
router.post("/:rideId/location", validate(driverLocationSchema), updateDriverLocation);

export default router;