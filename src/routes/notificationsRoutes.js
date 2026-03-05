import { Router } from "express";
import { listMyNotifications, markNotificationRead } from "../controllers/notificationsController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);
router.get("/my", listMyNotifications);
router.patch("/:notificationId/read", markNotificationRead);

export default router;
