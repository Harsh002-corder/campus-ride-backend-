import { Router } from "express";
import adminRoutes from "./adminRoutes.js";
import authRoutes from "./authRoutes.js";
import chatbotRoutes from "./chatbotRoutes.js";
import driversRoutes from "./driversRoutes.js";
import legacyRoutes from "./legacyRoutes.js";
import notificationsRoutes from "./notificationsRoutes.js";
import issuesRoutes from "./issuesRoutes.js";
import publicRoutes from "./publicRoutes.js";
import ridesRoutes from "./ridesRoutes.js";
import settingsRoutes from "./settingsRoutes.js";
import stopsRoutes from "./stopsRoutes.js";
import testDbRoutes from "./testDbRoutes.js";
import usersRoutes from "./usersRoutes.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "campus-rider-backend" });
});

router.use("/auth", authRoutes);
router.use("/rides", ridesRoutes);
router.use("/public", publicRoutes);
router.use("/users", usersRoutes);
router.use("/drivers", driversRoutes);
router.use("/admin", adminRoutes);
router.use("/settings", settingsRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/issues", issuesRoutes);
router.use("/chatbot", chatbotRoutes);
router.use("/legacy", legacyRoutes);
router.use("/test-db", testDbRoutes);
router.use("/stops", stopsRoutes);

export default router;