import jwt from "jsonwebtoken";
import { blockToken } from "../middleware/tokenBlocklist.js";
import Rider from "../model/rider.model.js";
import { generateAccessToken, generateRefreshToken } from "../utils/generateTokens.js";
import { sendTokenCookie } from "../utils/sendTokenCookie.js";

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

        sendTokenCookie(res, refreshToken, "riderToken");

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
