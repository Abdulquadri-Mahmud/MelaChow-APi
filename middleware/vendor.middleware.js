import jwt from "jsonwebtoken";
import vendorModel from "../model/vendor/vendor.model.js";
import { isTokenBlocked } from "./tokenBlocklist.js";

const authVendor = async (req, res, next) => {
  try {
    // Read token from HTTP-only cookie OR Authorization header
    const token = req.cookies.vendorToken || req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized (Vendor). Token missing or invalid."
      });
    }

    // Check blocklist BEFORE verifying signature (fast Redis check)
    const blocked = await isTokenBlocked(token);
    if (blocked) {
      return res.status(401).json({
        success: false,
        message: 'Session has been revoked. Please log in again.'
      });
    }

    // Verify JWT token
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

    // Fetch vendor from database
    const vendor = await vendorModel.findById(decoded.id);

    if (!vendor) {
      return res.status(401).json({
        success: false,
        message: "Vendor not found or deleted"
      });
    }

    // Check vendor is active and not soft-deleted
    // NOTE: Schema field is `active`, not `isActive`
    if (!vendor.active || vendor.deletedAt) {
      return res.status(403).json({
        success: false,
        message: "Vendor account is inactive or has been removed"
      });
    }

    // Attach vendor to request object for use in controllers
    req.vendor = vendor;
    next();
  } catch (err) {
    console.error("Vendor Auth Middleware Error:", err.message);

    return res.status(500).json({
      success: false,
      message: "Server error during authentication"
    });
  }
};

export default authVendor;