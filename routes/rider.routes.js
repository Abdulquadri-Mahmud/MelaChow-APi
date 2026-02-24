import express from "express";
import * as riderController from "../controller/rider.controller.js";
import authVendor from "../middleware/vendor.middleware.js";
import { requireRiderAuth } from "../middleware/riderAuth.middleware.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// Vendor manages their riders
router.post("/vendors/:vendorId/riders", authVendor, riderController.createRider);
router.get("/vendors/:vendorId/riders", authVendor, riderController.getVendorRiders);
router.get("/vendors/:vendorId/riders/available", authVendor, riderController.getAvailableRiders);
router.get("/vendors/:vendorId/riders/:riderId", authVendor, riderController.getSingleVendorRider);

router.patch("/vendors/:vendorId/riders/:riderId", authVendor, riderController.updateRider);
router.delete("/vendors/:vendorId/riders/:riderId", authVendor, riderController.deactivateRider);

// Vendor assigns a rider to an order
router.post("/vendors/:vendorId/orders/:orderId/assign-rider", authVendor, riderController.assignRider);

// Rider self-service actions
router.patch("/riders/:riderId/status", requireRiderAuth, riderController.updateRiderStatus);
router.patch("/riders/:riderId/picked-up", requireRiderAuth, riderController.markPickedUp);
router.patch("/riders/:riderId/delivered", requireRiderAuth, riderController.markDelivered);
router.get("/riders/:riderId/wallet", requireRiderAuth, riderController.getRiderWallet);

// Admin global rider management
router.get("/admin/riders", adminAuth, riderController.adminGetAllRiders);
router.patch("/admin/riders/:riderId", adminAuth, riderController.adminUpdateRider);
router.delete("/admin/riders/:riderId", adminAuth, riderController.adminDeactivateRider);
// Admin can also create riders for any vendor via the existing POST route if we allow adminAuth there
router.post("/admin/vendors/:vendorId/riders", adminAuth, riderController.createRider);

export default router;
