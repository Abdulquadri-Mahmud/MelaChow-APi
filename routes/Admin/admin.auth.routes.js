import express from "express";
import {
    loginAdmin,
    forgotAdminPassword,
    verifyAdminResetCode,
    resetAdminPassword,
    refreshAdminToken,
    logoutAdmin
} from "../../controller/Admin/admin.auth.controller.js";

const router = express.Router();

// ============================================
// ✅ NEW: Password-Based Authentication Routes
// ============================================

// Login
router.post("/login", loginAdmin);

// Password Reset Flow
router.post("/forgot-password", forgotAdminPassword);
router.post("/verify-reset-code", verifyAdminResetCode);
router.post("/reset-password", resetAdminPassword);

// Token Refresh
router.post("/refresh", refreshAdminToken);

// Logout
router.post("/logout", logoutAdmin);

export default router;
