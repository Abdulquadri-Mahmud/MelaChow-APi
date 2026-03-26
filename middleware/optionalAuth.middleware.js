import jwt from "jsonwebtoken";
import User from "../model/user.model.js";

/**
 * Optional authentication middleware
 * Populates req.user if a valid token is present, but allows the request to proceed even without authentication
 * Useful for endpoints that should work for both authenticated and unauthenticated users
 */
const optionalAuth = async (req, res, next) => {
    if (req.method === "OPTIONS") return next(); // skip preflight

    try {
        // Read token from cookie OR Authorization header
        const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

        // If no token, just continue without setting req.user
        if (!token) {
            return next();
        }

        // Try to verify and decode the token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            // Token is invalid or expired, but we don't reject the request
            // Just continue without setting req.user
            return next();
        }

        // Try to find the user
        const user = await User.findById(decoded.id).select("-password");

        if (user) {
            // User found, populate req.user
            req.user = user;
            req.userId = decoded.id;
        }

        // Continue regardless of whether user was found
        next();
    } catch (err) {
        console.error("Optional Auth Middleware Error:", err.message);
        // Even on error, we continue without authentication
        next();
    }
};

export default optionalAuth;
