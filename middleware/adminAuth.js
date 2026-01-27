import jwt from "jsonwebtoken";
import Admin from "../model/Admin/admin.model.js";

export const adminAuth = async (req, res, next) => {
  try {
    const token = req.cookies.adminToken;
    if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id);
    if (!admin) return res.status(401).json({ success: false, message: "Invalid token" });

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
