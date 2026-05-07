import jwt from "jsonwebtoken";
import User from "../model/user.model.js";
import { isTokenBlocked } from "./tokenBlocklist.js";

const auth = async (req, res, next) => {
  if (req.method === "OPTIONS") return next(); // skip preflight

  try {
    // Read token from cookie OR Authorization header
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Unauthorized. Token missing or invalid." });
    }

    // Check blocklist BEFORE verifying signature (fast Redis check)
    const blocked = await isTokenBlocked(token);
    if (blocked) {
      return res.status(401).json({
        success: false,
        message: 'Session has been revoked. Please log in again.'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired. Please login again." });
      }
      return res.status(403).json({ message: "Invalid or expired token" });
    }

    if (decoded.role && decoded.role !== "user") {
      return res.status(403).json({ message: "Access denied. User role required." });
    }

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found or deleted" });
    }

    if (!user.isActive || user.suspended || user.banned) {
      return res.status(403).json({ message: "User account is inactive, suspended, or banned." });
    }

    req.user = user;
    req.userId = decoded.id;

    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err.message);

    return res.status(500).json({ message: "Server error during authentication" });
  }
};

export default auth;
