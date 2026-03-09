// controllers/admin.controller.js
import { sendVendorApprovalEmail } from "../../../config/Admin/vendor_mailer/sendVendorApprovalEmail.js";
import { sendVendorReactivationEmail } from "../../../config/Admin/vendor_mailer/sendVendorReactivationEmail.js";
import { sendVendorRejectionEmail } from "../../../config/Admin/vendor_mailer/sendVendorRejectionEmail.js";
import { sendVendorSuspensionEmail } from "../../../config/Admin/vendor_mailer/sendVendorSuspensionEmail.js";
import Food from "../../../model/vendor/food.model.js";
import vendorModel from "../../../model/vendor/vendor.model.js";
import { resolveVendorLocation } from "../../../services/locationService.js";
import ActivityLog from "../../../model/ActivityLog.js";


/**
 * APPROVE A VENDOR
 * --------------------------------
 * Admin marks vendor as verified and notifies via email
 * Also handles location resolution for vendors with pending locations
 * 
 * Body params (optional):
 * - state: State name to assign (if location pending)
 * - city: City name to assign (if location pending)
 * - createLocation: Boolean - whether to create state/city if they don't exist
 */
export const approveVendor = async (req, res) => {
  try {
    const { vendorId } = req.query;
    const { state, city, createLocation = false } = req.body;

    const vendor = await vendorModel.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });

    // ========================================
    // HANDLE LOCATION RESOLUTION (NEW)
    // ========================================
    if (vendor.locationStatus === "pending_review") {
      // Use provided state/city or fall back to vendor's requested values
      const stateName = state || vendor.requestedState;
      const cityName = city || vendor.requestedCity;

      if (!stateName || !cityName) {
        return res.status(400).json({
          success: false,
          message: "Vendor has pending location. Please provide state and city to approve.",
          requestedState: vendor.requestedState,
          requestedCity: vendor.requestedCity,
        });
      }

      try {
        // Resolve location (create if admin allows)
        const locationData = await resolveVendorLocation(
          stateName,
          cityName,
          createLocation
        );

        // Update vendor with resolved location
        vendor.stateId = locationData.stateId;
        vendor.cityId = locationData.cityId;
        vendor.locationStatus = "approved";
        vendor.requestedState = "";
        vendor.requestedCity = "";

        // Update legacy string fields for backward compatibility
        vendor.address.state = stateName;
        vendor.address.city = cityName;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: `Location resolution failed: ${error.message}`,
          hint: "Set createLocation=true to create new state/city if they don't exist",
        });
      }
    }

    // ========================================
    // APPROVE VENDOR
    // ========================================
    vendor.verified = true;
    await vendor.save();

    // Send approval email
    await sendVendorApprovalEmail(vendor);

    // Log action
    await ActivityLog.create({
      adminId: req.admin._id,
      action: "APPROVE_VENDOR",
      targetType: "Vendor",
      targetId: vendor._id,
      details: `Approved vendor: ${vendor.storeName}`,
    });

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

    // Log action
    await ActivityLog.create({
      adminId: req.admin._id,
      action: "REJECT_VENDOR",
      targetType: "Vendor",
      targetId: vendor._id,
      details: `Rejected vendor: ${vendor.storeName}. Reason: ${reason || "N/A"}`,
    });

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

    // Log action
    await ActivityLog.create({
      adminId: req.admin._id,
      action: "SUSPEND_VENDOR",
      targetType: "Vendor",
      targetId: vendor._id,
      details: `Suspended vendor: ${vendor.storeName}. Reason: ${reason || "N/A"}`,
    });

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

    // Log action
    await ActivityLog.create({
      adminId: req.admin._id,
      action: "REACTIVATE_VENDOR",
      targetType: "Vendor",
      targetId: vendor._id,
      details: `Reactivated vendor: ${vendor.storeName}`,
    });

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
      .populate({
        path: "foods",
        populate: {
          path: "activePromotions",
          model: "Discount",
          select: "code description type value scope minOrderAmount maxDiscountAmount usageLimit usageCount userUsageLimit isActive startDate endDate fundedBy",
        },
      });

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

    // Log action
    await ActivityLog.create({
      adminId: req.admin._id,
      action: "UPDATE_COMMISSION",
      targetType: "Commission",
      details: `Updated global commission rate to ${newRate}% for all vendors`,
    });

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

// Vendor foods
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

/**
 * PATCH /api/admin/vendors/:vendorId/delivery-mode
 * Admin only. Switch whether a vendor manages their own delivery
 * or uses GrubDash platform riders.
 * Body: { deliveryManagedBy: "vendor" | "admin" }
 */
export const updateVendorDeliveryMode = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { deliveryManagedBy } = req.body;

    if (!["vendor", "admin"].includes(deliveryManagedBy)) {
      return res.status(400).json({
        success: false,
        message: "deliveryManagedBy must be either 'vendor' or 'admin'",
      });
    }

    const vendor = await vendorModel.findByIdAndUpdate(
      vendorId,
      { deliveryManagedBy },
      { new: true, runValidators: true }
    ).select("storeName deliveryManagedBy active"); // isActive is 'active' in the schema

    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found",
      });
    }

    console.log(`🔄 Vendor ${vendor.storeName} delivery mode → ${deliveryManagedBy}`);

    // Log action
    await ActivityLog.create({
      adminId: req.admin._id,
      action: "UPDATE_DELIVERY_MODE",
      targetType: "Vendor",
      targetId: vendor._id,
      details: `Updated ${vendor.storeName} delivery mode to ${deliveryManagedBy}`,
    });

    return res.status(200).json({
      success: true,
      message: `Delivery mode updated to '${deliveryManagedBy}'`,
      vendor,
    });
  } catch (err) {
    console.error("updateVendorDeliveryMode error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
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
