import { Router } from "express";
import {
  login,
  loginSchema,
  me,
  requestPasswordReset,
  requestPasswordResetSchema,
  requestSignupOtp,
  requestSignupOtpSchema,
  resetPassword,
  resetPasswordSchema,
  verifySignupOtp,
  verifySignupOtpSchema,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.post("/request-signup-otp", validate(requestSignupOtpSchema), requestSignupOtp);
router.post("/verify-signup-otp", validate(verifySignupOtpSchema), verifySignupOtp);
router.post("/forgot-password", validate(requestPasswordResetSchema), requestPasswordReset);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);
router.post("/login", validate(loginSchema), login);
router.get("/me", requireAuth, me);

export default router;