import express from "express";
import {
  createReport,
  getAllReports,
  getReportsByType,
  resolveReport,
} from "../controllers/reportController.js";

const router = express.Router();

// User creates a report
router.post("/report", createReport);

// Admin views all reports
router.get("/reports", getAllReports);

// Admin filters by target type
router.get("/reports/type", getReportsByType);

// Admin resolves a report
router.patch("/reports/resolve", resolveReport);

export default router;
