import express from "express";
import {
    getAllOrders,
    getSingleOrder,
    getOrderStats,
    adminOverrideOrderStatus,
    getPlatformManagedOrders,
    getCommissionLedger,
    assignRiderToOrder
} from "../../controller/Admin/order_management/adminOrder.controller.js";
import { adminAuth } from "../../middleware/adminAuth.js";

const router = express.Router();

// Specific routes first to avoid parameter collision
router.get("/stats", adminAuth, getOrderStats);
router.get("/platform-managed", adminAuth, getPlatformManagedOrders);
router.get("/commission-ledger", adminAuth, getCommissionLedger);

// List and single item routes
router.get("/", adminAuth, getAllOrders);
router.get("/:orderId", adminAuth, getSingleOrder);

// Status overrides
router.patch("/:orderId/status", adminAuth, adminOverrideOrderStatus);

// Rider Assignment
router.patch("/:vendorOrderId/assign-rider", adminAuth, assignRiderToOrder);

export default router;
