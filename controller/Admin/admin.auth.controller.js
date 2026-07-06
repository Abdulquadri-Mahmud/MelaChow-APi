import Admin from '../../model/Admin/admin.model.js';
import { generateAccessToken, generateRefreshToken, generateOTP, generateResetToken, verifyToken } from '../../utils/jwt.js';
import { sendMail } from '../../config/mailer.js';
import { sendAuthCookies } from '../../utils/sendTokenCookie.js';
import jwt from "jsonwebtoken";
import { blockToken } from "../../middleware/tokenBlocklist.js";

// ============================================
// ADMIN LOGIN (Email + Password)
// ============================================

export const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        // Find admin with password field
        const admin = await Admin.findOne({ email }).select('+password +loginAttempts +lockUntil');

        if (!admin) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Check if account is active
        if (admin.isActive === false) {
            return res.status(401).json({ message: 'Account deactivated. Please contact super admin.' });
        }

        // Check if account is locked
        if (admin.isLocked()) {
            return res.status(423).json({
                message: 'Account temporarily locked due to multiple failed login attempts. Try again in 15 minutes.'
            });
        }

        // Compare password
        const isMatch = await admin.comparePassword(password);

        if (!isMatch) {
            // Increment failed attempts
            await admin.incLoginAttempts();

            const attemptsLeft = 5 - (admin.loginAttempts + 1);
            if (attemptsLeft > 0) {
                return res.status(401).json({
                    message: `Invalid credentials. ${attemptsLeft} attempts remaining.`
                });
            } else {
                return res.status(423).json({
                    message: 'Account locked due to multiple failed attempts. Try again in 15 minutes.'
                });
            }
        }

        // Reset login attempts
        await admin.resetLoginAttempts();

        // Generate tokens
        const accessToken = generateAccessToken(admin._id, admin.role || 'admin');
        const refreshToken = generateRefreshToken(admin._id, admin.role || 'admin');

        // Set HttpOnly cookie
        sendAuthCookies(res, accessToken, refreshToken, 'admin');

        res.status(200).json({
            success: true,
            message: 'Login successful',
            admin: admin.getPublicProfile(),
            accessToken
        });

    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ message: 'Login failed', error: error.message });
    }
};

// ============================================
// FORGOT PASSWORD
// ============================================

export const forgotAdminPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const admin = await Admin.findOne({ email }).select('+otp +otpExpires');

        if (!admin) {
            return res.status(200).json({
                message: 'If an account exists with this email, a reset code will be sent.'
            });
        }

        // Generate OTP
        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        admin.otp = otp;
        admin.otpExpires = otpExpires;
        await admin.save();

        // Send reset email
        await sendMail({
            to: email,
            subject: 'Reset Your Admin Password - MelaChow',
            html: `
      <div style="font-family: 'Segoe UI', sans-serif; background-color: #f9fafb; padding: 30px;">
        <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
          <div style="background-color: #FF6B00; padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">MelaChow Admin</h1>
          </div>
          <div style="padding: 30px; color: #333;">
              <h2 style="color: #FF6B00; margin-bottom: 15px;">Reset Password OTP</h2>
              <p>We received a request to reset your <strong>MelaChow Admin</strong> password. Use the OTP below to proceed:</p>
              <div style="text-align: center; font-size: 28px; font-weight: bold; color: #FF6B00; margin: 25px 0;">${otp}</div>
              <p>This OTP is valid for <strong>10 minutes</strong>.</p>
          </div>
          <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 12px; color: #777;">
              Â© ${new Date().getFullYear()} MelaChow. All rights reserved.
          </div>
        </div>
      </div>
      `
        });

        res.status(200).json({
            message: 'Password reset code sent to your email',
            email
        });

    } catch (error) {
        console.error('Admin forgot password error:', error);
        res.status(500).json({ message: 'Failed to send reset code', error: error.message });
    }
};

// ============================================
// VERIFY RESET CODE
// ============================================

export const verifyAdminResetCode = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: 'Email and code are required' });
        }

        const admin = await Admin.findOne({ email }).select('+otp +otpExpires');

        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        if (String(admin.otp).trim() !== String(otp).trim()) {
            return res.status(400).json({ message: 'Invalid reset code' });
        }

        if (admin.otpExpires < Date.now()) {
            return res.status(400).json({ message: 'Reset code expired' });
        }

        // Generate reset token
        const resetToken = generateResetToken();

        admin.resetPasswordToken = resetToken;
        admin.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        admin.otp = undefined;
        admin.otpExpires = undefined;
        await admin.save();

        res.status(200).json({
            success: true,
            message: 'Reset code verified',
            resetToken
        });

    } catch (error) {
        console.error('Verify reset code error:', error);
        res.status(500).json({ message: 'Verification failed', error: error.message });
    }
};

// ============================================
// RESET PASSWORD
// ============================================

export const resetAdminPassword = async (req, res) => {
    try {
        const { email, resetToken, newPassword } = req.body;

        if (!email || !resetToken || !newPassword) {
            return res.status(400).json({ message: 'Email, reset token, and new password are required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }

        const admin = await Admin.findOne({
            email,
            resetPasswordToken: resetToken,
            resetPasswordExpires: { $gt: Date.now() }
        }).select('+resetPasswordToken +resetPasswordExpires +password');

        if (!admin) {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }

        // Set new password
        admin.password = newPassword;
        admin.resetPasswordToken = undefined;
        admin.resetPasswordExpires = undefined;
        admin.loginAttempts = 0;
        admin.lockUntil = undefined;
        admin.lastLogin = Date.now();
        await admin.save();

        // Generate tokens
        const accessToken = generateAccessToken(admin._id, admin.role || 'admin');
        const refreshToken = generateRefreshToken(admin._id, admin.role || 'admin');

        // Set HttpOnly cookie
        sendAuthCookies(res, accessToken, refreshToken, 'admin');

        res.status(200).json({
            success: true,
            message: 'Password reset successful',
            admin: admin.getPublicProfile(),
            accessToken
        });

    } catch (error) {
        console.error('Admin reset password error:', error);
        res.status(500).json({ message: 'Password reset failed', error: error.message });
    }
};

// ============================================
// TOKEN REFRESH
// ============================================

export const refreshAdminToken = async (req, res) => {
    try {
        const token = req.cookies.adminRefreshToken || req.cookies.adminToken;

        if (!token) {
            return res.status(401).json({ message: 'No refresh token provided' });
        }

        // Verify token
        const decoded = verifyToken(token);

        // Ensure it's an admin token
        if (!['admin', 'super-admin', 'finance-admin'].includes(decoded.role)) {
            return res.status(401).json({ message: 'Invalid role for admin refresh' });
        }

        // Ensure it's a refresh token
        if (decoded.type !== 'refresh') {
            return res.status(401).json({ message: 'Invalid token type' });
        }

        const admin = await Admin.findById(decoded.id);

        if (!admin || !admin.isActive) {
            return res.status(401).json({ message: 'Admin not found or inactive' });
        }

        // Generate new access token
        const accessToken = generateAccessToken(admin._id, admin.role);
        sendAuthCookies(res, accessToken, token, 'admin');

        res.status(200).json({
            success: true,
            accessToken
        });

    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(401).json({ message: 'Token refresh failed', error: error.message });
    }
};

export const logoutAdmin = async (req, res) => {
    try {
        const isProduction = process.env.NODE_ENV === "production";

        // Block the current token if it exists
        const token = req.cookies?.adminToken;
        if (token) {
            try {
                const decoded = jwt.decode(token);
                if (decoded?.exp) {
                    await blockToken(token, decoded.exp);
                }
            } catch (e) {
                console.warn("[logoutAdmin] Token blocking failed:", e.message);
            }
        }

        res.clearCookie("adminToken", {
            httpOnly: true,
            secure: isProduction,
            sameSite: "lax",
            path: "/",
        });
        res.clearCookie('adminRefreshToken', {
            httpOnly: true,
            secure: isProduction,
            sameSite: isProduction ? 'none' : 'lax',
            path: '/',
        });

        res.status(200).json({
            success: true,
            message: "Logged out successfully",
        });
    } catch (error) {
        console.error("Logout error:", error);
        res.status(500).json({
            success: false,
            message: "Server error during logout",
        });
    }
};

