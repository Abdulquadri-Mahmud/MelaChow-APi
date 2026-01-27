import express from "express";
import bodyParser from "body-parser";
import { paystackWebhook } from "../../controller/paystack/paystackWebhook";

const router = express.Router();

// Paystack webhook endpoint - must use raw body parser
router.post(
    "/paystack",
    bodyParser.raw({ type: "application/json" }),
    paystackWebhook
);

export default router;
