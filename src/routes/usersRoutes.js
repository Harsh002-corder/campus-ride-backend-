import { Router } from "express";
import {
  adminUpdateUser,
  adminUpdateUserSchema,
  adminDeleteUser,
  createFavorite,
  createFavoriteSchema,
  deleteFavorite,
  getMyProfile,
  listMyFavorites,
  listUsers,
  updateMyProfile,
  updateProfileSchema,
} from "../controllers/usersController.js";
import { ROLES } from "../constants/roles.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.use(requireAuth);

router.get("/me", getMyProfile);
router.patch("/me", validate(updateProfileSchema), updateMyProfile);
router.get("/me/favorites", listMyFavorites);
router.post("/me/favorites", validate(createFavoriteSchema), createFavorite);
router.delete("/me/favorites/:favoriteId", deleteFavorite);

router.get("/", requireRole(ROLES.ADMIN), listUsers);
router.patch("/:userId", requireRole(ROLES.ADMIN), validate(adminUpdateUserSchema), adminUpdateUser);
router.delete("/:userId", requireRole(ROLES.ADMIN), adminDeleteUser);

export default router;