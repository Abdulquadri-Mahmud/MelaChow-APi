import jwt from "jsonwebtoken";
import { blockToken } from "../middleware/tokenBlocklist.js";
import Rider from "../model/rider.model.js";
import { generateAccessToken, generateRefreshToken } from "../utils/generateTokens.js";
import { sendAuthCookies } from '../utils/sendTokenCookie.js';
import { generateOTP, generateResetToken } from "../utils/jwt.js";
import { sendMail } from "../config/mailer.js";

export const loginRider = async (req, res, next) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({ success: false, message: "Phone and password are required" });
        }

        const rider = await Rider.findOne({ phone, deletedAt: null }).select("+password");
        if (!rider) {
            return res.status(404).json({ success: false, message: "Rider not found" });
        }

        if (rider.isLocked()) {
            return res.status(403).json({
                success: false,
                message: "Account is temporarily locked due to too many failed attempts"
            });
        }

        if (!rider.isActive || !rider.isVerified) {
            return res.status(403).json({
                success: false,
                message: rider.isVerified
                    ? "Rider account is inactive"
                    : "Rider account is pending admin approval"
            });
        }

        const isMatch = await rider.comparePassword(password);
        if (!isMatch) {
            await rider.incLoginAttempts();
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        await rider.resetLoginAttempts();

        // JWT signing
        const payload = {
            riderId: rider._id,
            vendorId: rider.vendorId,
            role: "rider"
        };

        // Note: Reusing existing utility functions.
        // If jwt.js specifically expects different arg names, adjustment might be needed.
        // But usually it's payload object.
        const accessToken = generateAccessToken(payload);
        const refreshToken = generateRefreshToken(payload);

        sendAuthCookies(res, accessToken, refreshToken, 'rider');

        res.status(200).json({
            success: true,
            message: "Login successful",
            accessToken,
            rider: rider.getPublicProfile()
        });
    } catch (error) {
        next(error);
    }
};

export const logoutRider = async (req, res) => {
    try {
        // Block the current tokens (both refresh from cookie and access from header)
        const tokensToBlock = [
            req.cookies?.riderToken,
            req.headers.authorization?.split(" ")[1]
        ].filter(Boolean);

        for (const token of tokensToBlock) {
            try {
                const decoded = jwt.decode(token);
                if (decoded?.exp) {
                    await blockToken(token, decoded.exp);
                }
            } catch (e) {
                console.warn("[logoutRider] Token blocking failed:", e.message);
            }
        }

        res.clearCookie("riderToken", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            path: "/",
        });
        res.clearCookie('riderRefreshToken', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            path: '/',
        });

        res.status(200).json({ success: true, message: "Logged out successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Logout failed", error: error.message });
    }
};

export const getMe = async (req, res) => {
    res.status(200).json({
        success: true,
        data: req.rider.getPublicProfile()
    });
};

/**
 * Handle rider push notification subscription
 */
export const subscribeRider = async (req, res, next) => {
    try {
        const { subscription, deviceType } = req.body;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ success: false, message: "Subscription is required" });
        }

        const RiderPushSubscription = (await import("../model/notification/riderPushSubscription.model.js")).default;

        await RiderPushSubscription.findOneAndUpdate(
            { 'subscription.endpoint': subscription.endpoint },
            {
                riderId: req.rider._id,
                subscription,
                deviceType: deviceType || 'web',
                userAgent: req.headers['user-agent'],
                lastUsed: new Date()
            },
            { upsert: true, new: true }
        );

        res.status(200).json({ success: true, message: "Subscribed to push notifications" });
    } catch (error) {
        next(error);
    }
};

// ============================================
// RIDER FORGOT PASSWORD
// ============================================
export const forgotRiderPassword = async (req, res, next) => {
    try {
        const { phoneOrEmail, phone, email } = req.body;
        const identifier = (phoneOrEmail || phone || email || "").trim();

        if (!identifier) {
            return res.status(400).json({ success: false, message: "Phone number or email is required" });
        }

        const searchPhone = identifier.replace(/[^\d+]/g, '');

        const rider = await Rider.findOne({
            $or: [
                { phone: identifier },
                ...(searchPhone ? [{ phone: searchPhone }] : []),
                { email: identifier.toLowerCase() }
            ],
            deletedAt: null
        }).select("+otp +otpExpires");

        if (!rider) {
            return res.status(200).json({
                success: true,
                message: "If an active rider account exists with this phone or email, a reset code has been issued.",
                target: identifier
            });
        }

        const otp = generateOTP();
        const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        rider.otp = otp;
        rider.otpExpires = otpExpires;
        await rider.save();

        console.log(`[RiderForgotPassword] 🔑 OTP generated for Rider ${rider._id} (${rider.phone}): ${otp}`);

        if (rider.email) {
            try {
                await sendMail({
                    to: rider.email,
                    subject: "Reset Your Rider Password - MelaChow",
                    html: `
                    <div style="font-family: 'Segoe UI', sans-serif; background-color: #f9fafb; padding: 30px;">
                      <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">
                        <div style="background-color: #EA580C; padding: 24px; text-align: center;">
                            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 800;">MelaChow Rider</h1>
                        </div>
                        <div style="padding: 30px; color: #333;">
                            <h2 style="color: #EA580C; margin-bottom: 15px;">Reset Your Rider Account Password</h2>
                            <p>We received a request to reset the password for your MelaChow Rider account (Phone: <strong>${rider.phone}</strong>).</p>
                            <p>Use the OTP code below to proceed with resetting your password:</p>
                            <div style="text-align: center; font-size: 32px; font-weight: 900; letter-spacing: 4px; color: #EA580C; margin: 25px 0; background: #FFF7ED; padding: 16px; border-radius: 12px; border: 1px dashed #FDBA74;">${otp}</div>
                            <p style="font-size: 13px; color: #666;">This code is valid for <strong>10 minutes</strong>. If you did not request a password reset, please ignore this message.</p>
                        </div>
                        <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 12px; color: #777;">
                            © ${new Date().getFullYear()} MelaChow Logistics. All rights reserved.
                        </div>
                      </div>
                    </div>
                    `
                });
            } catch (mailError) {
                console.error("[RiderForgotPassword] Mail sending error:", mailError.message);
            }
        }

        return res.status(200).json({
            success: true,
            message: "Password reset code sent successfully.",
            target: identifier,
            hasEmail: !!rider.email,
            ...(process.env.NODE_ENV === "development" ? { devOtp: otp } : {})
        });

    } catch (error) {
        next(error);
    }
};

// ============================================
// VERIFY RIDER RESET CODE
// ============================================
export const verifyRiderResetCode = async (req, res, next) => {
    try {
        const { phoneOrEmail, otp } = req.body;

        if (!phoneOrEmail || !otp) {
            return res.status(400).json({ success: false, message: "Phone/email and reset code are required" });
        }

        const identifier = phoneOrEmail.trim();
        const searchPhone = identifier.replace(/[^\d+]/g, '');

        const rider = await Rider.findOne({
            $or: [
                { phone: identifier },
                ...(searchPhone ? [{ phone: searchPhone }] : []),
                { email: identifier.toLowerCase() }
            ],
            deletedAt: null
        }).select("+otp +otpExpires +resetPasswordToken +resetPasswordExpires");

        if (!rider) {
            return res.status(404).json({ success: false, message: "Rider account not found" });
        }

        if (!rider.otp || String(rider.otp).trim() !== String(otp).trim()) {
            return res.status(400).json({ success: false, message: "Invalid reset code" });
        }

        if (rider.otpExpires && rider.otpExpires < new Date()) {
            return res.status(400).json({ success: false, message: "Reset code has expired. Please request a new code." });
        }

        const resetToken = generateResetToken();
        rider.resetPasswordToken = resetToken;
        rider.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 mins
        rider.otp = undefined;
        rider.otpExpires = undefined;
        await rider.save();

        return res.status(200).json({
            success: true,
            message: "Reset code verified successfully",
            resetToken
        });

    } catch (error) {
        next(error);
    }
};

// ============================================
// RIDER RESET PASSWORD
// ============================================
export const resetRiderPassword = async (req, res, next) => {
    try {
        const { phoneOrEmail, resetToken, newPassword } = req.body;

        if (!phoneOrEmail || !resetToken || !newPassword) {
            return res.status(400).json({ success: false, message: "Phone/email, reset token, and new password are required" });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ success: false, message: "New password must be at least 8 characters long" });
        }

        const identifier = phoneOrEmail.trim();
        const searchPhone = identifier.replace(/[^\d+]/g, '');

        const rider = await Rider.findOne({
            $or: [
                { phone: identifier },
                ...(searchPhone ? [{ phone: searchPhone }] : []),
                { email: identifier.toLowerCase() }
            ],
            resetPasswordToken: resetToken,
            resetPasswordExpires: { $gt: new Date() },
            deletedAt: null
        }).select("+password +resetPasswordToken +resetPasswordExpires");

        if (!rider) {
            return res.status(400).json({ success: false, message: "Invalid or expired reset session. Please request a new reset code." });
        }

        rider.password = newPassword;
        rider.resetPasswordToken = undefined;
        rider.resetPasswordExpires = undefined;
        rider.loginAttempts = 0;
        rider.lockUntil = undefined;
        await rider.save();

        return res.status(200).json({
            success: true,
            message: "Password reset successful! You can now log in with your new password."
        });

    } catch (error) {
        next(error);
    }
};
