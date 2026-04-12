import express from "express";
import auth from "../../middleware/auth.middleware.js";
import { adminAuth } from "../../middleware/adminAuth.js";
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
    initiateWithdrawal,
    getWithdrawalHistory
} from "../../controller/wallet/withdrawal.controller.js";
import vendorAuth from "../../middleware/vendor.middleware.js";

const router = express.Router();

// User Routes
router.get("/", auth, getUserWallet);
router.post("/fund", auth, initiateWalletFunding); // Initialize Paystack
router.get("/verify/:reference", auth, verifyWalletFunding); // Verify Paystack

// Admin Routes (Credit/Refund User)
router.post("/admin/credit", adminAuth, creditUserWallet);

// Public Bank Discovery (for registration onboarding)
router.get("/public/banks", getBankList);
router.get("/public/resolve-account", resolveAccount);

// Vendor Bank Registration Routes (Protected)
router.get("/banks", vendorAuth, getBankList);
router.get("/resolve-account", vendorAuth, resolveAccount);
router.post("/bank-account", vendorAuth, saveBankAccount);
router.delete("/bank-account", vendorAuth, removeBankAccount);

// Vendor Withdrawal Routes
router.post("/withdraw", vendorAuth, initiateWithdrawal);
router.get("/withdrawals", vendorAuth, getWithdrawalHistory);

export default router;
