import jwt from "jsonwebtoken";
import User from "../model/user.model.js";
import { isTokenBlocked } from "./tokenBlocklist.js";

const optionalAuth = async (req, res, next) => {
  if (req.method === "OPTIONS") return next();

  try {
    const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];
    if (!token) return next();

    const blocked = await isTokenBlocked(token);
    if (blocked) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (user) {
      req.user = user;
      req.userId = decoded.id;
    }
  } catch {
    // Public pages should still load promo data for anonymous/expired sessions.
  }

  return next();
};

export default optionalAuth;
