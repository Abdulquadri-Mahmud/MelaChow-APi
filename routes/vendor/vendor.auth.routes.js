import express from "express";
import rateLimit from "express-rate-limit";
import {
    registerVendor,
    verifyVendorRegistration,
    setVendorPassword,
    loginVendorWithPassword,
    vendorForgotPasswordNew,
    verifyVendorResetCode,
    resetVendorPasswordNew,
    refreshVendorToken,
    vendorLogout
} from "../../controller/vendor/vendor.auth.controller.js";
import { autocompleteDeliveryAddress, getDeliveryPlaceDetails } from "../../controller/location/googleLocation.controller.js";

const router = express.Router();
const vendorLocationLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
});

// ============================================
// ✅ NEW: Password-Based Authentication Routes
// ============================================

// Registration flow
router.post("/register", registerVendor);
router.get("/locations/autocomplete", vendorLocationLimiter, autocompleteDeliveryAddress);
router.get("/locations/place/:placeId", vendorLocationLimiter, getDeliveryPlaceDetails);
router.post("/verify-registration", verifyVendorRegistration);
router.post("/verify-otp", verifyVendorRegistration); // Alias for frontend compatibility
router.post("/set-password", setVendorPassword);

// Login
router.post("/login-password", loginVendorWithPassword);
router.post("/login", loginVendorWithPassword); // Alias

// Password Reset Flow
router.post("/forgot-password", vendorForgotPasswordNew);
router.post("/verify-reset-code", verifyVendorResetCode);
router.post("/verify-reset", verifyVendorResetCode); // Alias
router.post("/reset-password", resetVendorPasswordNew);

// Token Refresh
router.post("/refresh", refreshVendorToken);

// Logout
router.post("/logout", vendorLogout);

export default router;
