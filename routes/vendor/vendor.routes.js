
import express from "express";
import {
    createVendor,
    deleteVendor,
    getNearbyVendors,
    getVendorById,
    getVendorForUserDisplay,
    getWalletForVendor,
    getVendorOrders,
    getVendorOrderById,
    restoreVendor,
    updateVendor,
    updateVendorTodayHours,
    updateVendorAvailability,
    getVendorAnalytics,
    getVendorPayoutDetails,
    respondToRemakeRequest,
    setVendorLiveStatus,
} from "../../controller/vendor/vendor.controller.js";
import {
    updateVendorOrderStatus,
    completeVendorOrder
} from "../../controller/order/orderController.js";
import { getVendorReviews } from "../../controller/user/user.reviews.controller.js";
import vendorAuth from "../../middleware/vendor.middleware.js";
import { getVendorOwnPromoStatus } from "../../controller/Admin/vendorPromo.controller.js";

import { getVendorPickupCode } from "../../controller/vendor/pickupCode.controller.js";
const router = express.Router();

// Vendor reads their own promo status (read-only)
router.get("/promo/delivery-status", vendorAuth, getVendorOwnPromoStatus);

// Legacy unauthenticated vendor creation retired (mass-assignment risk); use /api/vendor/auth/register
router.post("/create", (_req, res) =>
  res.status(410).json({
    success: false,
    message: "This endpoint is retired. Use POST /api/vendor/auth/register.",
  })
);

router.get("/vendor", getVendorForUserDisplay); // Get nearby vendors

// Get all vendors
router.get("/nearby", getNearbyVendors); // Get nearby vendors
router.get("/get-vendor", vendorAuth, getVendorById);       // Get vendor by ID/slug
router.patch("/live-status", vendorAuth, setVendorLiveStatus); // Vendor publishes or pauses own store
router.patch("/availability", vendorAuth, updateVendorAvailability); // Intelligent availability controls (busy mode, pause, temp closure, prep time, auto-schedule)
router.get("/analytics", vendorAuth, getVendorAnalytics); // Business analytics & restaurant insights
router.get("/get-wallet", vendorAuth, getWalletForVendor);  // Get vendor wallet
router.get("/payout-details", vendorAuth, getVendorPayoutDetails);  // Get hidden payout structure
router.get("/reviews", vendorAuth, getVendorReviews);         // Get vendor reviews
router.get("/orders", vendorAuth, getVendorOrders);         // Get vendor orders
router.get("/orders/:vendorOrderId", vendorAuth, getVendorOrderById); // Get single vendor order
router.post("/orders/:vendorOrderId/pickup-code", vendorAuth, getVendorPickupCode);
router.patch("/orders/:vendorOrderId/update", vendorAuth, updateVendorOrderStatus); // Update order status
router.patch("/orders/:vendorOrderId/complete", vendorAuth, completeVendorOrder); // Complete order status
router.post("/orders/:vendorOrderId/remake-response", vendorAuth, respondToRemakeRequest); // Respond to disputed delivery remake window
router.patch("/today-hours", vendorAuth, updateVendorTodayHours); // Update only today's opening hours
router.patch("/update-vendor", vendorAuth, updateVendor);        // Update vendor
router.delete("/delete-vendor", vendorAuth, deleteVendor);     // Soft delete
router.patch("/restore-vendor", vendorAuth, restoreVendor); // Restore soft-deleted vendor

export default router;
