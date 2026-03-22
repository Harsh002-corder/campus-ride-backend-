import { Router } from "express";
import {
	listMyNotifications,
	markNotificationRead,
	registerPushToken,
	registerPushTokenSchema,
	removePushToken,
	removePushTokenSchema,
	sendTestNotification,
} from "../controllers/notificationsController.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.use(requireAuth);
router.get("/my", listMyNotifications);
router.patch("/:notificationId/read", markNotificationRead);
router.post("/token", validate(registerPushTokenSchema), registerPushToken);
router.delete("/token", validate(removePushTokenSchema), removePushToken);
router.post("/test", sendTestNotification);

export default router;
