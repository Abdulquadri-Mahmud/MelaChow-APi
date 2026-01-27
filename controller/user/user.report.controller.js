import Reports from "../models/reportModel.js";
import userModel from "../models/userModel.js";
import vendorModel from "../models/vendorModel.js";
import foodModel from "../models/foodModel.js";

/**
 * @desc Create a new report
 * @route POST /api/report
 * @access User
 */
export const createReport = async (req, res) => {
  try {
    const { reporterId, targetType, targetId, reason } = req.body;

    // Validate required fields
    if (!reporterId || !targetType || !targetId || !reason) {
      return res.status(400).json({
        success: false,
        message: "All fields (reporterId, targetType, targetId, reason) are required.",
      });
    }

    // Validate target type
    const validTargets = ["vendor", "food", "user"];
    if (!validTargets.includes(targetType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid targetType. Must be 'vendor', 'food', or 'user'.",
      });
    }

    // Check that the reporter exists
    const reporter = await userModel.findById(reporterId);
    if (!reporter)
      return res.status(404).json({ success: false, message: "Reporter user not found." });

    // Validate that the target exists before saving report
    let targetExists = false;
    if (targetType === "vendor") targetExists = await vendorModel.findById(targetId);
    if (targetType === "food") targetExists = await foodModel.findById(targetId);
    if (targetType === "user") targetExists = await userModel.findById(targetId);

    if (!targetExists)
      return res.status(404).json({
        success: false,
        message: `The ${targetType} you are reporting does not exist.`,
      });

    // Create the report
    const report = await Reports.create({
      reporterId,
      targetType,
      targetId,
      reason,
    });

    res.status(201).json({
      success: true,
      message: "Report created successfully. Our team will review it shortly.",
      report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating report",
      error: error.message,
    });
  }
};

/**
 * @desc Get all reports (admin)
 * @route GET /api/reports
 * @access Admin
 */
export const getAllReports = async (req, res) => {
  try {
    const reports = await Reports.find()
      .populate("reporterId", "firstname lastname email")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, total: reports.length, reports });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching reports",
      error: error.message,
    });
  }
};

/**
 * @desc Get reports by target type (optional)
 * @route GET /api/reports/type?vendor|food|user
 * @access Admin
 */
export const getReportsByType = async (req, res) => {
  try {
    const { targetType } = req.query;

    if (!targetType)
      return res.status(400).json({ success: false, message: "targetType query is required" });

    const reports = await Reports.find({ targetType }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, total: reports.length, reports });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching reports by type",
      error: error.message,
    });
  }
};

/**
 * @desc Mark report as resolved (admin)
 * @route PUT /api/reports/resolve?reportId=...
 * @access Admin
 */
export const resolveReport = async (req, res) => {
  try {
    const { reportId } = req.query;

    const report = await Reports.findById(reportId);
    if (!report)
      return res.status(404).json({ success: false, message: "Report not found" });

    report.status = "resolved";
    await report.save();

    res.status(200).json({
      success: true,
      message: "Report marked as resolved successfully",
      report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error resolving report",
      error: error.message,
    });
  }
};
