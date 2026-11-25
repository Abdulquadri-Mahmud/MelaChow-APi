import express from "express";
import rateLimit from "express-rate-limit";
import auth from "../../middleware/auth.middleware.js";
import { financeAdminOnly, superAdminOnly } from "../../middleware/adminAuth.js";
import {
    getUserWallet,
    initiateWalletFunding,
    verifyWalletFunding,
    creditUserWallet
} from "../../controller/user/wallet.controller.js";
import {
    getBankList,
    resolveAccount,
    saveBankAccount,
    removeBankAccount
} from "../../controller/wallet/bankAccount.controller.js";
import {
    getWithdrawalHistory,
    forceFailWithdrawal,
    initiateWithdrawal
} from "../../controller/wallet/withdrawal.controller.js";
import vendorAuth from "../../middleware/vendor.middleware.js";

const router = express.Router();

// User Routes
router.get("/", auth, getUserWallet);
router.post("/fund", auth, initiateWalletFunding); // Initialize Paystack
router.get("/verify/:reference", auth, verifyWalletFunding); // Verify Paystack

// Admin Routes (Credit/Refund User)
router.post("/admin/credit", financeAdminOnly, creditUserWallet);

// Public Bank Discovery (for registration onboarding)
const publicResolveLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 5, // max 5 account-name lookups per IP per 10 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many bank account verification attempts. Please wait 10 minutes and try again.",
    },
});
router.get("/public/banks", getBankList);
router.get("/public/resolve-account", publicResolveLimiter, resolveAccount);

// Vendor Bank Registration Routes (Protected)
router.get("/banks", vendorAuth, getBankList);
router.get("/resolve-account", vendorAuth, resolveAccount);
router.post("/bank-account", vendorAuth, saveBankAccount);
// Self-service bank account removal is disabled to enforce BANK_DETAILS_LOCKED.
// Bank changes must go through superAdminOnly /api/admin/vendors/payout-details.
router.delete("/bank-account", vendorAuth, (_req, res) =>
    res.status(403).json({
        success: false,
        code: "BANK_DETAILS_LOCKED",
        message: "Registered bank accounts cannot be removed self-service. Please contact MelaChow support.",
    })
);

// Vendor Withdrawal Routes
router.post("/withdraw", vendorAuth, initiateWithdrawal);
router.get("/withdrawals", vendorAuth, getWithdrawalHistory);
router.patch("/admin/withdrawals/:withdrawalId/force-fail", superAdminOnly, forceFailWithdrawal);

export default router;
