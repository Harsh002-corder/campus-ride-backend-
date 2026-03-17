import { Router } from "express";
import {
  adminUpdateUser,
  adminUpdateUserSchema,
  adminDeleteUser,
  createFavorite,
  createFavoriteSchema,
  createSubAdmin,
  createSubAdminSchema,
  deleteFavorite,
  getMyProfile,
  listMyFavorites,
  listUsers,
  updateMyProfile,
  updateProfileSchema,
} from "../controllers/usersController.js";
import { ADMIN_DASHBOARD_ROLES, ROLES } from "../constants/roles.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.use(requireAuth);

router.get("/me", getMyProfile);
router.patch("/me", validate(updateProfileSchema), updateMyProfile);
router.get("/me/favorites", listMyFavorites);
router.post("/me/favorites", validate(createFavoriteSchema), createFavorite);
router.delete("/me/favorites/:favoriteId", deleteFavorite);

router.get("/", requireRole(...ADMIN_DASHBOARD_ROLES), listUsers);
router.post("/create-sub-admin", requireRole(ROLES.ADMIN), validate(createSubAdminSchema), createSubAdmin);
router.patch("/:userId", requireRole(...ADMIN_DASHBOARD_ROLES), validate(adminUpdateUserSchema), adminUpdateUser);
router.delete("/:userId", requireRole(...ADMIN_DASHBOARD_ROLES), adminDeleteUser);

export default router;