import express from 'express';
import {
    register,
    verifyRegistration,
    setPassword,
    loginWithPassword,
    forgotPasswordNew,
    verifyResetCode,
    resetPasswordNew,
    refreshToken
} from '../../controller/user/user.auth.controller.js';
import auth from '../../middleware/auth.middleware.js';
import { getProfile } from '../../controller/user/user.controller.js';
import { logout } from '../../controller/auth.controller.js';

const router = express.Router();

// ============================================
// PUBLIC ROUTES (no auth required)
// ============================================

// ✅ NEW: Registration flow with password
router.post('/register', register);
router.post('/verify-registration', verifyRegistration);
router.post('/set-password', setPassword);

// ✅ NEW: Password-based login
router.post('/login-password', loginWithPassword);

// ✅ NEW: Password reset flow
router.post('/forgot-password-new', forgotPasswordNew);
router.post('/verify-reset-code', verifyResetCode);
router.post('/reset-password-new', resetPasswordNew);

// ✅ NEW: Token refresh
router.post('/refresh', refreshToken);

// ============================================
// PROTECTED ROUTES (auth required)
// ============================================

router.get('/profile', auth, getProfile);
router.post('/logout', auth, logout);

export default router;
