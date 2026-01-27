// routes/paymentRoutes.js
import express from "express";
import { verifyPayment } from "../controllers/paymentController.js";

const router = express.Router();

// Verify Paystack payment using reference
// Example: GET /api/payment/verify?reference=abc123&user=xyz&vendor=uvw&order=789
router.get("/verify", verifyPayment);

export default router;
