import express from "express";
import bodyParser from "body-parser";
import auth from "../../middleware/auth.middleware.js";

import {
  getSingleOrder,
  getUserOrders,
  initializePayment,
  verifyPayment,
  verifyPaymentV2,
  paystackWebhook,
  cancelOrder
} from "../../controller/order/orderController.js";

import {
  createOrderController,
  getFreeDeliveryEligibility,
} from "../../controller/order/createOrderV2.controller.js";

const router = express.Router();

// Paystack Webhook (raw body)
router.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  paystackWebhook
);

// Payment Routes
router.post("/create", auth, initializePayment);
router.post("/verify/:reference", auth, verifyPayment);

// V2 Routes (Enhanced Validation)
router.post("/v2/free-delivery-eligibility", auth, getFreeDeliveryEligibility);
router.post("/v2/create", auth, createOrderController);
router.post("/v2/verify/:reference", auth, verifyPaymentV2);

// Order Routes
router.get("/my-orders", auth, getUserOrders);

// GET /api/orders/:orderId
router.get("/:orderId", auth, getSingleOrder);

// DELETE /api/orders/:orderId/cancel
router.patch("/:orderId/cancel", auth, cancelOrder);


export default router;
