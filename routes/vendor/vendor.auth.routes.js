import express from "express";
import { 
    vendorForgotPassword,
    vendorLogin, 
    vendorLogout, 
    vendorResendOTP, 
    vendorResetPassword, 
    verifyVendorOTP
} from "../../controller/vendor/vendor.auth.controller.js";

const router = express.Router();

router.post("/login", vendorLogin);                // Step 1: login & send OTP
router.post("/verify-otp", verifyVendorOTP);       // Step 2: verify OTP and get JWT
router.post("/forgot-password", vendorForgotPassword);
router.post("/reset-password", vendorResetPassword);
router.post("/resend-otp", vendorResendOTP);
router.post("/logout", vendorLogout);

export default router;