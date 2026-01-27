import jwt from "jsonwebtoken";
import User from "../model/user.model.js";

const auth = async (req, res, next) => {
  if (req.method === "OPTIONS") return next(); // skip preflight

  try {
    // Read token from cookie
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({ message: "Unauthorized. Token missing or invalid." });
    }

    // Legacy support removal: We no longer check headers
    // const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired. Please login again." });
      }
      return res.status(403).json({ message: "Invalid or expired token" });
    }

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found or deleted" });
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
