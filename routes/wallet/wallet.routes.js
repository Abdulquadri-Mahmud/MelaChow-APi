import express from "express";
import auth from "../../middleware/auth.middleware.js";
import { adminAuth } from "../../middleware/adminAuth.js";
import {
    getUserWallet,
    initiateWalletFunding,
    verifyWalletFunding,
    creditUserWallet
} from "../../controller/user/wallet.controller.js";

const router = express.Router();

// User Routes
router.get("/", auth, getUserWallet);
router.post("/fund", auth, initiateWalletFunding); // Initialize Paystack
router.get("/verify/:reference", auth, verifyWalletFunding); // Verify Paystack

// Admin Routes (Credit/Refund User)
router.post("/admin/credit", adminAuth, creditUserWallet);

export default router;
