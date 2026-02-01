import express from "express";
import { verifyDiscount } from "../../controller/discount/discount.controller.js";
import auth from "../../middleware/auth.middleware.js";

const router = express.Router();

// Verify discount (Auth optional if we want guest checkout, but usually strictly auth for now)
// "Do NOT modify authentication logic" -> We use existing.
// Assuming we want authenticated users to apply discounts.
router.post("/verify", auth, verifyDiscount);

export default router;
