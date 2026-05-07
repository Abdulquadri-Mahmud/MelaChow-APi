import jwt from "jsonwebtoken";
import Admin from "../model/Admin/admin.model.js";
import { isTokenBlocked } from "./tokenBlocklist.js";

export const adminAuth = async (req, res, next) => {
  try {
    // Read token from HTTP-only cookie OR Authorization header
    const token = req.cookies.adminToken || req.headers.authorization?.split(" ")[1];

    if (!token) return res.status(401).json({ success: false, message: "Unauthorized (Admin). Token missing or invalid." });

    // Check blocklist before verifying signature
    const blocked = await isTokenBlocked(token);
    if (blocked) {
      return res.status(401).json({
        success: false,
        message: "Session has been revoked. Please log in again."
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!["admin", "super-admin", "finance-admin"].includes(decoded.role)) {
      return res.status(403).json({ success: false, message: "Access denied. Admin role required." });
    }

    const admin = await Admin.findById(decoded.id);
    if (!admin) return res.status(401).json({ success: false, message: "Invalid token" });
    if (!admin.isActive) {
      return res.status(403).json({ success: false, message: "Admin account is inactive." });
    }

    req.admin = admin;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: "Authentication failed", error: err.message });
  }
};

export const superAdminOnly = async (req, res, next) => {
  await adminAuth(req, res, async () => {
    if (req.admin.role !== "super-admin")
      return res.status(403).json({ success: false, message: "Access denied" });
    next();
  });
};
