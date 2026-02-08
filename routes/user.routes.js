import express from 'express';
import {
    forgotPassword, getProfile,
    login, resetPassword, signup,
    updateProfile, resendOtp,
    addAddress,
    updateAddress,
    deleteAddress,
    deleteAccount,
    getUserAddresses,
} from '../controller/user/user.controller.js';
import { logout } from '../controller/auth.controller.js';
import { getUserReviews } from '../controller/user/user.reviews.controller.js';
import auth from '../middleware/auth.middleware.js';
import { verifyOTP } from '../controller/otp.verification.controller.js';
import userAuthRoutes from './user/user.auth.routes.js'; // ✅ NEW: Password-based auth routes

const router = express.Router();

// ============================================
// ✅ NEW: Password-Based Authentication Routes
// ============================================
router.use('/', userAuthRoutes);

// ============================================
// LEGACY: OTP-Based Authentication (Keep for migration)
// ============================================
router.post('/signup', signup);
// router.post('/verify-email', verifyEmail);
// router.post('/verify-otp', verifyOtp);

router.post('/login', login);
router.post('/resend-otp', resendOtp);

router.post('/verify-account', verifyOTP);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

router.get('/profile', auth, getProfile);
router.patch('/update-profile', auth, updateProfile)

router.post("/address", auth, addAddress);
router.get("/my-address", auth, getUserAddresses);

router.patch("/address/update-address", auth, updateAddress);
router.delete("/address/delete-address", auth, deleteAddress);


router.post('/logout', logout)
router.get('/reviews', auth, getUserReviews)
router.delete('/delete', auth, deleteAccount)

export default router;