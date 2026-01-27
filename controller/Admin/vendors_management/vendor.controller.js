// controllers/admin.controller.js
import { sendVendorApprovalEmail } from "../../../config/Admin/vendor_mailer/sendVendorApprovalEmail.js";
import { sendVendorReactivationEmail } from "../../../config/Admin/vendor_mailer/sendVendorReactivationEmail.js";
import { sendVendorRejectionEmail } from "../../../config/Admin/vendor_mailer/sendVendorRejectionEmail.js";
import { sendVendorSuspensionEmail } from "../../../config/Admin/vendor_mailer/sendVendorSuspensionEmail.js";
import Food from "../../../model/vendor/food.model.js";
import vendorModel from "../../../model/vendor/vendor.model.js";

/**
 * APPROVE A VENDOR
 * --------------------------------
 * Admin marks vendor as verified and notifies via email
 */
export const approveVendor = async (req, res) => {
  try {
    const { vendorId } = req.query;

    const vendor = await vendorModel.findByIdAndUpdate(
      vendorId,
      { verified: true },
      { new: true }
    );

    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });

    // Send approval email
    await sendVendorApprovalEmail(vendor);

    res.status(200).json({
      success: true,
      message: "Vendor approved successfully and notified via email",
      vendor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error approving vendor",
      error: error.message,
    });
  }
};

// REJECT VENDOR
export const rejectVendor = async (req, res) => {
  try {
    const { vendorId, reason } = req.query;

    const vendor = await vendorModel.findById(vendorId);
    if (!vendor)
      return res.status(404).json({ success: false, message: "Vendor not found" });

    if (vendor.verified)
      return res.status(400).json({ success: false, message: "Vendor already verified, cannot reject." });

    vendor.status = "rejected";
    vendor.rejectionReason = reason || "Your verification request has been rejected.";
    await vendor.save();

    // Send rejection email
    await sendVendorRejectionEmail(vendor, reason);

    res.status(200).json({
      success: true,
      message: "Vendor rejected successfully and notified via email",
      vendor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error rejecting vendor",
      error: error.message,
    });
  }
};

// SUSPEND VENDOR
export const suspendVendor = async (req, res) => {
  try {
    const { vendorId, reason } = req.query;

    // Find vendor
    const vendor = await vendorModel.findById(vendorId);
    if (!vendor)
      return res.status(404).json({ success: false, message: "Vendor not found" });

    // Check if already suspended
    if (vendor.suspended)
      return res.status(400).json({ success: false, message: "Vendor is already suspended." });

    // Update vendor status
    vendor.suspended = true;
    vendor.suspensionReason =
      reason || "Your account has been suspended due to policy violations.";
    await vendor.save();

    // Send suspension email
    await sendVendorSuspensionEmail(vendor, vendor.suspensionReason);

    res.status(200).json({
      success: true,
      message: "Vendor suspended successfully and notified via email",
      vendor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error suspending vendor",
      error: error.message,
    });
  }
};

// REACTIVATE VENDOR
export const reactivateVendor = async (req, res) => {
  try {
    const { vendorId } = req.query;

    const vendor = await vendorModel.findById(vendorId);
    if (!vendor)
      return res.status(404).json({ success: false, message: "Vendor not found" });

    if (!vendor.suspended)
      return res.status(400).json({ success: false, message: "Vendor is not suspended" });

    vendor.suspended = false;
    vendor.suspensionReason = null;
    await vendor.save();

    // Optional email
    await sendVendorReactivationEmail(vendor);

    res.status(200).json({
      success: true,
      message: "Vendor reactivated successfully",
      vendor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error reactivating vendor",
      error: error.message,
    });
  }
};


// ============================
// VENDOR MANAGEMENT CONTROLLER
// ============================

// Get all vendors (optionally filter by status, verified, suspended)
export const getAllVendors = async (req, res) => {
  try {
    const { verified, suspended, active } = req.query;
    const filters = {};

    if (verified !== undefined) filters.verified = verified === "true";
    if (suspended !== undefined) filters.suspended = suspended === "true";
    if (active !== undefined) filters.active = active === "true";

    const vendors = await vendorModel.find(filters)
      .populate("wallet")
      .populate("foods")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, count: vendors.length, vendors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get single vendor details
export const getVendor = async (req, res) => {
  try {
    const { vendorId } = req.query;
    if (!vendorId)
      return res.status(400).json({ success: false, message: "vendorId is required" });

    const vendor = await vendorModel.findById(vendorId)
      .populate("wallet")
      .populate("foods");

    if (!vendor)
      return res.status(404).json({ success: false, message: "Vendor not found" });

    res.json({ success: true, vendor });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Approve or reject vendor KYC


// Suspend or reactivate vendor
export const toggleVendorStatus = async (req, res) => {
  try {
    const { vendorId, suspended } = req.query;

    if (!vendorId)
      return res.status(400).json({ success: false, message: "vendorId is required" });

    const vendor = await vendorModel.findById(vendorId);
    if (!vendor)
      return res.status(404).json({ success: false, message: "Vendor not found" });

    // Convert 'suspended' query string ("true"/"false") to boolean
    const isSuspended = suspended === "true";

    // Update vendor suspension status
    vendor.suspended = isSuspended;
    await vendor.save();

    res.status(200).json({
      success: true,
      message: `Vendor has been ${isSuspended ? "suspended" : "reactivated"} successfully`,
      vendor,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error toggling vendor status",
      error: err.message,
    });
  }
};


// Update vendor commission rate
export const updateCommission = async (req, res) => {
  try {
    const { commissionRate } = req.body;

    if (!commissionRate)
      return res
        .status(400)
        .json({ success: false, message: "commissionRate is required" });

    const newRate = parseFloat(commissionRate);
    if (isNaN(newRate))
      return res
        .status(400)
        .json({ success: false, message: "Invalid commission rate" });

    // Update all vendors' commission rate
    const result = await vendorModel.updateMany({}, { $set: { commissionRate: newRate } });

    res.status(200).json({
      success: true,
      message: `Commission rate updated to ${newRate}% for all vendors`,
      updatedCount: result.modifiedCount,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Error updating commission rate for all vendors",
      error: err.message,
    });
  }
};

// Vendor performance metrics
export const getVendorPerformance = async (req, res) => {
  try {
    const { vendorId } = req.query;
    if (!vendorId)
      return res.status(400).json({ success: false, message: "vendorId is required" });

    const vendor = await vendorModel.findById(vendorId)
      .populate("foods")
      .populate("wallet");

    if (!vendor)
      return res.status(404).json({ success: false, message: "Vendor not found" });

    const metrics = {
      totalSales: vendor.totalSales,
      totalOrders: vendor.totalOrders,
      rating: vendor.rating,
      ratingCount: vendor.ratingCount,
      foodCount: vendor.foods?.length || 0,
      walletBalance: vendor.wallet?.balance || 0,
    };

    res.json({ success: true, metrics });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// All foods by vendor
export const getVendorFoods = async (req, res) => {
  try {
    const { vendorId } = req.query;
    if (!vendorId)
      return res.status(400).json({ success: false, message: "vendorId is required" });

    const foods = await Food.find({ vendor: vendorId }).sort({ createdAt: -1 });
    res.json({ success: true, count: foods.length, foods });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Handle automatic commission split
// export const splitCommission = async ({ vendorId, totalAmount, description }) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();
//   try {
//     const vendor = await vendorModel.findById(vendorId).populate("wallet").session(session);
//     if (!vendor) throw new Error("Vendor not found");

//     const adminWallet = await Wallet.findOne({ ownerModel: "Admin" }).session(session);
//     if (!adminWallet) throw new Error("Admin wallet not found");

//     const commissionAmount = totalAmount * vendor.commissionRate;
//     const vendorAmount = totalAmount - commissionAmount;

//     // Vendor wallet update
//     vendor.wallet.balance += vendorAmount;
//     vendor.wallet.transactions.push({
//       type: "credit",
//       amount: vendorAmount,
//       description,
//     });
//     await vendor.wallet.save({ session });

//     // Admin wallet update
//     adminWallet.balance += commissionAmount;
//     adminWallet.transactions.push({
//       type: "credit",
//       amount: commissionAmount,
//       description: `Commission from ${vendor.storeName}`,
//     });
//     await adminWallet.save({ session });

//     await session.commitTransaction();
//     session.endSession();

//     console.log(`💸 Commission split done: Vendor ${vendorAmount}, Admin ${commissionAmount}`);

//     // Later: trigger notifications (email/SMS/push)
//     return { vendorAmount, commissionAmount };
//   } catch (err) {
//     await session.abortTransaction();
//     session.endSession();
//     throw err;
//   }
// };
