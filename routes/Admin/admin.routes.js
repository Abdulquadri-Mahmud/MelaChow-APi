import express from "express";
import {
    deleteAdmin,
    forgotPassword,
    getAllAdmins,
    loginAdmin,
    registerAdmin,
    resetPassword,
    logoutAdmin,
    getRecentActivities
} from "../../controller/Admin/admin.controller.js";
import { adminAuth } from "../../middleware/adminAuth.js";
import { getOperationalVelocity } from "../../controller/Admin/dashboard.controller.js";
import { getVendorMetrics } from "../../controller/Admin/vendorMetrics.controller.js";
import { forceFailWithdrawal } from "../../controller/wallet/withdrawal.controller.js";
import {
    approveVendor,
    getAllVendors,
    getVendor,
    getVendorFoods,
    getVendorPerformance,
    reactivateVendor,
    rejectVendor,
    suspendVendor,
    toggleVendorStatus,
    updateCommission,
    updateVendorDeliveryMode,
} from "../../controller/Admin/vendors_management/vendor.controller.js";

const router = express.Router();

// Auth routes
router.post("/register", registerAdmin);
router.post("/login", loginAdmin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/logout", logoutAdmin);

// Admin management
router.get("/get-all", adminAuth, getAllAdmins);
router.delete("/delete/:id", adminAuth, deleteAdmin);
router.get("/activities", adminAuth, getRecentActivities);

// Admin Dashboard Analytics
router.get("/dashboard/operational-velocity", adminAuth, getOperationalVelocity);

// Vendor Management Routes (Admin Protected)
router.get("/vendors/metrics", adminAuth, getVendorMetrics);
router.patch("/vendors/approve", adminAuth, approveVendor);
router.patch("/vendors/reject", adminAuth, rejectVendor);
router.patch("/vendors/suspend", adminAuth, suspendVendor);
router.patch("/vendors/reactivate", adminAuth, reactivateVendor);

// GET /api/admin/vendors/get-all?verified=true&suspended=false
router.get("/vendors/get-all", adminAuth, getAllVendors);

// Get one vendor details
// GET /api/admin/vendors/single?vendorId=123
router.get("/vendors/single", adminAuth, getVendor);

// Suspend or reactivate vendor
// PATCH /api/admin/vendors/status?vendorId=123&suspended=true
router.patch("/vendors/status", adminAuth, toggleVendorStatus);

// Update vendor commission
// PATCH /api/admin/vendors/commission
router.patch("/vendors/commission", adminAuth, updateCommission);

// Switch vendor delivery management mode
router.patch("/vendors/:vendorId/delivery-mode", adminAuth, updateVendorDeliveryMode);

// Vendor performance metrics
// GET /api/vendors/performance?vendorId=123
router.get("/vendors/performance", adminAuth, getVendorPerformance);

// Vendor foods
// GET /api/vendors/foods?vendorId=123
router.get("/vendors/foods", adminAuth, getVendorFoods);

// Force fail stuck withdrawal
router.patch("/withdrawals/:withdrawalId/force-fail", adminAuth, forceFailWithdrawal);

export default router;
