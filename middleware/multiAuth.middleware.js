import jwt from "jsonwebtoken";
import User from "../model/user.model.js";
import Vendor from "../model/vendor/vendor.model.js";
import Admin from "../model/Admin/admin.model.js";
import { isTokenBlocked } from "./tokenBlocklist.js";

/**
 * Unified authentication middleware that supports Users, Vendors, and Admins.
 * It checks for tokens in their respective cookies and populates req.userId.
 */
const multiAuth = async (req, res, next) => {
    if (req.method === "OPTIONS") return next();

    try {
        // 1. Check for User token (Cookie or Auth Header)
        const userToken = req.cookies.token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);
        if (userToken) {
            const blocked = await isTokenBlocked(userToken);
            if (!blocked) {
                try {
                    const decoded = jwt.verify(userToken, process.env.JWT_SECRET);
                    const user = await User.findById(decoded.id).select("-password");
                    if (user) {
                        req.user = user;
                        req.userId = decoded.id;
                        req.userType = 'user';
                        return next();
                    }
                } catch (err) {
                    // Carry on to check other tokens if this one fails (e.g. expired)
                    console.warn("User token verification failed:", err.message);
                }
            } else {
                console.warn("User token is blocked");
            }
        }

        // 2. Check for Vendor token (Cookie or Auth Header)
        const vendorToken = req.cookies.vendorToken || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);
        if (vendorToken) {
            const blocked = await isTokenBlocked(vendorToken);
            if (!blocked) {
                try {
                    const decoded = jwt.verify(vendorToken, process.env.JWT_SECRET);
                    const vendor = await Vendor.findById(decoded.id);
                    if (vendor) {
                        req.vendor = vendor;
                        req.userId = decoded.id;
                        req.userType = 'vendor';
                        return next();
                    }
                } catch (err) {
                    console.warn("Vendor token verification failed:", err.message);
                }
            } else {
                console.warn("Vendor token is blocked");
            }
        }

        // 3. Check for Admin token (Cookie or Auth Header)
        const adminToken = req.cookies.adminToken || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);
        if (adminToken) {
            const blocked = await isTokenBlocked(adminToken);
            if (!blocked) {
                try {
                    const decoded = jwt.verify(adminToken, process.env.JWT_SECRET);
                    const admin = await Admin.findById(decoded.id);
                    if (admin) {
                        req.admin = admin;
                        req.userId = decoded.id;
                        req.userType = 'admin';
                        return next();
                    }
                } catch (err) {
                    console.warn("Admin token verification failed:", err.message);
                }
            } else {
                console.warn("Admin token is blocked");
            }
        }

        // If no valid token found in any supported cookie or header
        return res.status(401).json({
            success: false,
            message: "Unauthorized. Token missing or invalid."
        });

    } catch (err) {
        console.error("Multi Auth Middleware Error:", err);
        return res.status(500).json({
            success: false,
            message: "Server error during authentication"
        });
    }
};

export default multiAuth;
