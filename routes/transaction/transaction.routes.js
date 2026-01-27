// routes/transaction.routes.js
import express from "express";
import { 
    handlePaystackWebhook,
    initializePayment, 
    verifyPayment

} from "../../controller/transaction/transaction.controller.js";

const router = express.Router();

// Initialize a new transaction
router.post("/initialize", initializePayment);

// Verify transaction after Paystack redirect
router.get("/verify", verifyPayment);

// Paystack webhook
router.post("/webhook", express.json({ type: "*/*" }), handlePaystackWebhook);

export default router;
