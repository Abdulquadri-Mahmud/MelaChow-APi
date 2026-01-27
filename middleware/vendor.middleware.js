import jwt from "jsonwebtoken";
import vendorModel from "../model/vendor/vendor.model.js";

const authVendor = async (req, res, next) => {
  try {
    // Read token from HTTP-only cookie
    const token = req.cookies.vendorToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Token missing or invalid."
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