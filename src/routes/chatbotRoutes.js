import { Router } from "express";
import { z } from "zod";
import { sendJarviouMessage } from "../controllers/chatbotController.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

const chatbotMessageSchema = z.object({
  message: z.string().min(1).max(2000),
});

router.use(requireAuth);
router.post("/message", validate(chatbotMessageSchema), sendJarviouMessage);

export default router;
