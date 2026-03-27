import jwt from "jsonwebtoken";
import Rider from "../model/rider.model.js";
import { isTokenBlocked } from './tokenBlocklist.js';

export const requireRiderAuth = async (req, res, next) => {
    try {
        // Read token from HTTP-only cookie OR Authorization header
        const token = req.cookies.riderToken || req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized (Rider). Token missing or invalid."
            });
        }

        // Check blocklist before verifying signature
        const blocked = await isTokenBlocked(token);
        if (blocked) {
            return res.status(401).json({
                success: false,
                message: "Session has been revoked. Please log in again."
            });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            if (err.name === "TokenExpiredError") {
                return res.status(401).json({
                    success: false,
                    message: "Token expired. Please login again."
                });
            }
            return res.status(403).json({
                success: false,
                message: "Invalid or expired token"
            });
        }

        // Role check
        if (decoded.role !== "rider") {
            return res.status(403).json({
                success: false,
                message: "Access denied. Rider role required."
            });
        }

        // Get ID from token (standardized as 'id' in our jwt utility)
        const riderId = decoded.id || decoded.riderId;

        const rider = await Rider.findById(riderId).select("-password -otp -otpExpires");

        if (!rider) {
            return res.status(401).json({
                success: false,
                message: "Rider not found or deleted"
            });
        }

        if (!rider.isActive || rider.deletedAt) {
            return res.status(403).json({
                success: false,
                message: "Account is inactive or has been deleted"
            });
        }

        req.rider = rider;
        next();
    } catch (err) {
        console.error("Rider Auth Middleware Error:", err.message);
        return res.status(500).json({
            success: false,
            message: "Server error during authentication"
        });
    }
};
