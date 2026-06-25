/**
 * ⛔ DEPRECATED PAYMENT ROUTE — DO NOT USE
 *
 * Returns 410 Gone for any client still hitting the old /api/payment/verify endpoint.
 * The controller import has been intentionally removed to ensure this route
 * cannot delegate to any live payment processing logic under any circumstance.
 *
 * Correct routes: /api/orders/initialize-payment and /api/orders/verify-payment
 */
import express from "express";

const router = express.Router();

const gone = (_req, res) => res.status(410).json({
    success: false,
    message: "This endpoint is deprecated. Use POST /api/orders/verify-payment.",
});

router.get("/verify", gone);
router.post("/verify", gone);

export default router;
