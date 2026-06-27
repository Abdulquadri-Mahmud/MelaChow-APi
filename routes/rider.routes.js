import express from "express";
import * as riderController from "../controller/rider.controller.js";
import {
    resolveAccountName,
    saveBankAccount,
    getRiderBankAccount,
    getRiderWithdrawalHistory,
    initiateRiderWithdrawal,
} from "../controller/rider/riderWithdrawal.controller.js";
import { getBankList } from "../controller/wallet/bankAccount.controller.js";
import authVendor from "../middleware/vendor.middleware.js";
import { requireRiderAuth } from "../middleware/riderAuth.middleware.js";
import { adminAuth } from "../middleware/adminAuth.js";

const router = express.Router();

// Public rider self-registration. Accounts remain pending until admin approval.
router.post("/riders/register", riderController.registerRider);

// Vendor manages their riders (DISABLED - Admins now manage riders)
// router.post("/vendors/:vendorId/riders", authVendor, riderController.createRider);
// router.get("/vendors/:vendorId/riders", authVendor, riderController.getVendorRiders);
// router.get("/vendors/:vendorId/riders/available", authVendor, riderController.getAvailableRiders);
// router.get("/vendors/:vendorId/riders/:riderId", authVendor, riderController.getSingleVendorRider);
// router.patch("/vendors/:vendorId/riders/:riderId", authVendor, riderController.updateRider);
// router.delete("/vendors/:vendorId/riders/:riderId", authVendor, riderController.deactivateRider);

// Vendor assigns a rider to an order (DISABLED - Admins now handle assignments or automated)
// router.post("/vendors/:vendorId/orders/:orderId/assign-rider", authVendor, riderController.assignRider);

// ✅ FIX: This route was called by the dashboard (getActiveRiderOrder) but NEVER existed.
// Without it, fetchActiveOrder() always got a 404 → activeOrder was always null
// → rider could never see their assigned delivery on the dashboard.
router.get("/riders/:riderId/active-order", requireRiderAuth, riderController.getActiveOrder);
router.get("/riders/:riderId/pending-offers", requireRiderAuth, riderController.getPendingOffers);

// Rider self-service actions
router.patch("/riders/:riderId/status", requireRiderAuth, riderController.updateRiderStatus);
router.patch("/riders/:riderId/picked-up", requireRiderAuth, riderController.markPickedUp);
router.post("/riders/:riderId/request-delivery-otp", requireRiderAuth, riderController.requestDeliveryOTP);
router.post("/riders/:riderId/confirm-delivery", requireRiderAuth, riderController.confirmDelivery);
router.get("/riders/:riderId/wallet", requireRiderAuth, riderController.getRiderWallet);

// Rider delivery overhaul: termination and undeliverable reporting
router.post("/riders/:riderId/orders/:orderId/terminate", requireRiderAuth, riderController.riderTerminateOrder);
router.post("/riders/:riderId/orders/:orderId/undeliverable", requireRiderAuth, riderController.riderReportUndeliverable);

// ── Rider payout routes ───────────────────────────────────────────────────────
// Step 1: Resolve account name before saving (lets rider confirm before committing)
router.get("/riders/:riderId/payout/resolve-account", requireRiderAuth, resolveAccountName);
// Step 2a: Save bank account and create Paystack recipient
router.post("/riders/:riderId/payout/bank-account", requireRiderAuth, saveBankAccount);
// Step 2b: Fetch saved bank account details
router.get("/riders/:riderId/payout/bank-account", requireRiderAuth, getRiderBankAccount);
// Step 3: Initiate manual withdrawal to bank account
router.post("/riders/:riderId/payout/withdraw", requireRiderAuth, initiateRiderWithdrawal);
// History: Fetch past withdrawals
router.get("/riders/:riderId/payout/history", requireRiderAuth, getRiderWithdrawalHistory);
// Bank list: rider-scoped, uses same stateless Paystack controller as vendor
// MUST NOT use /wallet/banks — that route is vendorAuth-protected and will 401 riders
router.get("/riders/banks", requireRiderAuth, getBankList);
router.get("/riders/:riderId/orders", requireRiderAuth, riderController.getRiderOrders);
router.get("/riders/:riderId/orders/:orderId", requireRiderAuth, riderController.getRiderOrderDetails);
router.patch("/riders/:riderId", requireRiderAuth, riderController.riderUpdateSelf);

// Admin global rider management
router.get("/admin/riders", adminAuth, riderController.adminGetAllRiders);
router.patch("/admin/riders/:riderId", adminAuth, riderController.adminUpdateRider);
router.patch("/admin/riders/:riderId/approve", adminAuth, riderController.adminApproveRider);
router.delete("/admin/riders/:riderId", adminAuth, riderController.adminDeactivateRider);
router.patch("/admin/riders/:riderId/reject-offer", adminAuth, riderController.adminRejectRiderAssignment);
router.get("/admin/riders/:riderId/history", adminAuth, riderController.adminGetRiderHistory);
router.post("/admin/riders", adminAuth, riderController.createRider); // ✅ NEW: Create platform-wide rider
router.post("/admin/vendors/:vendorId/riders", adminAuth, riderController.createRider); // Tie to specific vendor
router.get("/admin/rider-assignments", adminAuth, riderController.adminGetAssignmentHistory);
router.get("/admin/platform-vehicles", adminAuth, riderController.adminGetPlatformVehicles);
router.post("/admin/platform-vehicles", adminAuth, riderController.adminCreatePlatformVehicle);
router.patch("/admin/platform-vehicles/:vehicleId", adminAuth, riderController.adminUpdatePlatformVehicle);
router.delete("/admin/platform-vehicles/:vehicleId", adminAuth, riderController.adminDeletePlatformVehicle);
router.patch("/admin/platform-vehicles/:vehicleId/unassign", adminAuth, riderController.adminUnassignRiderFromVehicle);

export default router;
