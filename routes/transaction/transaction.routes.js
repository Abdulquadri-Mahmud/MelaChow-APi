// routes/transaction.routes.js
import express from "express";
import { 
    handlePaystackWebhook,
    initializePayment, 
    verifyPayment

} from "../../controller/transaction/transaction.controller.js";
import auth from "../../middleware/auth.middleware.js";

const router = express.Router();

// Legacy transaction initialization retired (accepted client-supplied amount); use /api/orders/v2/create
router.post("/initialize", auth, (_req, res) =>
    res.status(410).json({
        success: false,
        message: "This legacy endpoint is retired. Use POST /api/orders/v2/create.",
    })
);

// Verify transaction after Paystack redirect
router.get("/verify", auth, verifyPayment);

// Paystack webhook
router.post("/webhook", express.json({ type: "*/*" }), handlePaystackWebhook);

export default router;
