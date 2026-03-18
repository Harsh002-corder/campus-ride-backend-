import { Router } from "express";
import { testCreateUser, testCreateUserSchema, testFetchRides } from "../controllers/testDbController.js";
import { validate } from "../middleware/validate.js";

const router = Router();

router.post("/users", validate(testCreateUserSchema), testCreateUser);
router.get("/rides", testFetchRides);

export default router;