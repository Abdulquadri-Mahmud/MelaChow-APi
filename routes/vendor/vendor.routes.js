
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
    updateVendorOrderStatus,
    restoreVendor,
    updateVendor
} from "../../controller/vendor/vendor.controller.js";
import { getVendorReviews } from "../../controller/user/user.reviews.controller.js";
import vendorAuth from "../../middleware/vendor.middleware.js";

const router = express.Router();

router.post("/create", createVendor);          // Create vendor

router.get("/vendor", getVendorForUserDisplay); // Get nearby vendors

// Get all vendors
router.get("/nearby", getNearbyVendors); // Get nearby vendors
router.get("/get-vendor", vendorAuth, getVendorById);       // Get vendor by ID/slug
router.get("/get-wallet", vendorAuth, getWalletForVendor);  // Get vendor wallet
router.get("/reviews", vendorAuth, getVendorReviews);         // Get vendor reviews
router.get("/orders", vendorAuth, getVendorOrders);         // Get vendor orders
router.get("/orders/:orderId", vendorAuth, getVendorOrderById); // Get single vendor order
router.patch("/orders/:orderId/update", vendorAuth, updateVendorOrderStatus); // Update order status
router.patch("/update-vendor", vendorAuth, updateVendor);        // Update vendor
router.delete("/delete-vendor", vendorAuth, deleteVendor);     // Soft delete
router.patch("/restore-vendor", vendorAuth, restoreVendor); // Restore soft-deleted vendor

export default router;
