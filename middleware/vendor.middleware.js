import jwt from "jsonwebtoken";
import vendorModel from "../model/vendor/vendor.model.js";
import { isTokenBlocked } from "./tokenBlocklist.js";
import { findVendorByTokenId, postgresVendorIdentityEnabled, publicVendor } from "../services/postgres/vendorIdentity.repository.js";

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
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token"
      });
    }

    if (decoded.type !== 'access') {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }

    if (decoded.role !== "vendor") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Vendor role required."
      });
    }

    // Fetch vendor from database
    const postgresVendor = postgresVendorIdentityEnabled() ? await findVendorByTokenId(decoded.id) : null;
    const vendor = postgresVendorIdentityEnabled()
      ? (postgresVendor ? publicVendor(postgresVendor) : null)
      : await vendorModel.findById(decoded.id);

    if (!vendor) {
      return res.status(401).json({
        success: false,
        message: "Vendor not found or deleted"
      });
    }

    // Check vendor is active and not soft-deleted
    // NOTE: Schema field is `active`, not `isActive`
    if (!vendor.active || vendor.suspended || vendor.deletedAt) {
      return res.status(403).json({
        success: false,
        message: "Vendor account is inactive, suspended, or has been removed"
      });
    }

    // Attach vendor to request object for use in controllers
    req.vendor = vendor;
    req.vendorId = vendor._id;
    req.postgresVendorId = postgresVendor?.id || null;
    req.postgresVendor = postgresVendor || null;
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
