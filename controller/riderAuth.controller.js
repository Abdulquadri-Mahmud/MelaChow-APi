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
    res.clearCookie("riderToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
    });
    res.status(200).json({ success: true, message: "Logged out successfully" });
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
