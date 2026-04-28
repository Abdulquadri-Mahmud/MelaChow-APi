
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
    getVendorPayoutDetails
} from "../../controller/vendor/vendor.controller.js";
import {
    updateVendorOrderStatus,
    completeVendorOrder
} from "../../controller/order/orderController.js";
import { getVendorReviews } from "../../controller/user/user.reviews.controller.js";
import vendorAuth from "../../middleware/vendor.middleware.js";
import { getVendorOwnPromoStatus } from "../../controller/Admin/vendorPromo.controller.js";

const router = express.Router();

// Vendor reads their own promo status (read-only)
router.get("/promo/delivery-status", vendorAuth, getVendorOwnPromoStatus);

router.post("/create", createVendor);          // Create vendor

router.get("/vendor", getVendorForUserDisplay); // Get nearby vendors

// Get all vendors
router.get("/nearby", getNearbyVendors); // Get nearby vendors
router.get("/get-vendor", vendorAuth, getVendorById);       // Get vendor by ID/slug
router.get("/get-wallet", vendorAuth, getWalletForVendor);  // Get vendor wallet
router.get("/payout-details", vendorAuth, getVendorPayoutDetails);  // Get hidden payout structure
router.get("/reviews", vendorAuth, getVendorReviews);         // Get vendor reviews
router.get("/orders", vendorAuth, getVendorOrders);         // Get vendor orders
router.get("/orders/:vendorOrderId", vendorAuth, getVendorOrderById); // Get single vendor order
router.patch("/orders/:vendorOrderId/update", vendorAuth, updateVendorOrderStatus); // Update order status
router.patch("/orders/:vendorOrderId/complete", vendorAuth, completeVendorOrder); // Complete order status
router.patch("/update-vendor", vendorAuth, updateVendor);        // Update vendor
router.delete("/delete-vendor", vendorAuth, deleteVendor);     // Soft delete
router.patch("/restore-vendor", vendorAuth, restoreVendor); // Restore soft-deleted vendor

export default router;
