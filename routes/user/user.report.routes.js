import express from "express";
import {
  createReport,
  getAllReports,
  getReportsByType,
  resolveReport,
} from "../../controller/user/user.report.controller.js";
import auth from "../../middleware/auth.middleware.js";
import { adminAuth } from "../../middleware/adminAuth.js";

const router = express.Router();

// User creates a report
router.post("/report", auth, createReport);

// Admin views all reports
router.get("/reports", adminAuth, getAllReports);

// Admin filters by target type
router.get("/reports/type", adminAuth, getReportsByType);

// Admin resolves a report
router.patch("/reports/resolve", adminAuth, resolveReport);

export default router;
