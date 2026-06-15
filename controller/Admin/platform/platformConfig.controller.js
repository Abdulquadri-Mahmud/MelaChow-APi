import PlatformConfig from "../../../model/platform/PlatformConfig.model.js";
import "../../../model/Admin/admin.model.js";
import logger from "../../../config/logger.js";
import { usePostgresPlatformConfigReads } from "../../../services/postgres/compat.js";
import { platformConfigRepository } from "../../../services/postgres/platformConfig.repository.js";

/**
 * GET /api/admin/platform-config
 * Returns current platform financial configuration.
 * If never set, returns the schema defaults (mirrors hardcoded startup values).
 */
export const getAdminPlatformConfig = async (req, res) => {
  try {
    if (usePostgresPlatformConfigReads()) {
      const response = await platformConfigRepository.getAdminConfig();
      return res.json(response);
    }

    const config = await PlatformConfig.findOne({ type: "singleton" })
      .populate("lastUpdatedBy", "email name")
      .lean();

    // No config yet — return defaults so dashboard can render initial state
    if (!config) {
      return res.json({
        success: true,
        data: {
          riderFixedPayout: 600,
          riderMinPayoutBalance: 500,
          riderAssignmentMode: "manual",
          commissionEnabled: false,
          commissionRate: 0,
          serviceFeeEnabled: false,
          serviceFeeType: "fixed",
          serviceFeeValue: 0,
          serviceFeeCap: 500,
          lastUpdatedBy: null,
          updatedAt: null,
          _isDefault: true,  // Signal to frontend: "not yet saved"
        },
      });
    }

    return res.json({ success: true, data: config });
  } catch (error) {
    logger.error({ error: error.message }, "❌ Failed to fetch platform config");
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /api/admin/platform-config
 * Upserts the singleton config document.
 * Only the fields provided in the request body are updated (partial update safe).
 *
 * Validates:
 * - riderFixedPayout ≥ 0
 * - commissionRate 0–100
 * - serviceFeeType ∈ [fixed, percentage]
 * - percentage fee ≤ 20% (business guard rail)
 * - serviceFeeCap ≥ 0
 */
export const updateAdminPlatformConfig = async (req, res) => {
  try {
    const adminId = req.admin?._id;
    const {
      riderFixedPayout,
      riderMinPayoutBalance,
      riderAssignmentMode,
      commissionEnabled,
      commissionRate,
      serviceFeeEnabled,
      serviceFeeType,
      serviceFeeValue,
      serviceFeeCap,
    } = req.body;

    // ── Input validation ───────────────────────────────────────────────────
    const errors = [];

    if (riderFixedPayout !== undefined) {
      if (typeof riderFixedPayout !== "number" || riderFixedPayout < 0) {
        errors.push("riderFixedPayout must be a non-negative number");
      }
    }

    if (riderMinPayoutBalance !== undefined) {
      if (typeof riderMinPayoutBalance !== "number" || riderMinPayoutBalance < 0) {
        errors.push("riderMinPayoutBalance must be a non-negative number");
      }
    }

    if (riderAssignmentMode !== undefined && !["manual", "automatic"].includes(riderAssignmentMode)) {
      errors.push("riderAssignmentMode must be 'manual' or 'automatic'");
    }

    if (commissionRate !== undefined) {
      if (typeof commissionRate !== "number" || commissionRate < 0 || commissionRate > 100) {
        errors.push("commissionRate must be a number between 0 and 100");
      }
    }

    if (serviceFeeType !== undefined) {
      if (!["fixed", "percentage"].includes(serviceFeeType)) {
        errors.push("serviceFeeType must be 'fixed' or 'percentage'");
      }
    }

    if (serviceFeeValue !== undefined && serviceFeeType === "percentage" && serviceFeeValue > 20) {
      errors.push("Percentage service fee cannot exceed 20%");
    }

    if (serviceFeeValue !== undefined && typeof serviceFeeValue !== "number") {
      errors.push("serviceFeeValue must be a number");
    }

    if (serviceFeeCap !== undefined && (typeof serviceFeeCap !== "number" || serviceFeeCap < 0)) {
      errors.push("serviceFeeCap must be a non-negative number");
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // ── Build update payload (only provided fields) ─────────────────────
    const update = { lastUpdatedBy: adminId };
    if (riderFixedPayout !== undefined) update.riderFixedPayout = riderFixedPayout;
    if (riderMinPayoutBalance !== undefined) update.riderMinPayoutBalance = riderMinPayoutBalance;
    if (riderAssignmentMode !== undefined) update.riderAssignmentMode = riderAssignmentMode;
    if (commissionEnabled !== undefined) update.commissionEnabled = commissionEnabled;
    if (commissionRate !== undefined) update.commissionRate = commissionRate;
    if (serviceFeeEnabled !== undefined) update.serviceFeeEnabled = serviceFeeEnabled;
    if (serviceFeeType !== undefined) update.serviceFeeType = serviceFeeType;
    if (serviceFeeValue !== undefined) update.serviceFeeValue = serviceFeeValue;
    if (serviceFeeCap !== undefined) update.serviceFeeCap = serviceFeeCap;

    const config = await PlatformConfig.findOneAndUpdate(
      { type: "singleton" },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    ).populate("lastUpdatedBy", "email name");

    logger.info(
      { adminId, changes: Object.keys(update).filter(k => k !== "lastUpdatedBy") },
      "✅ Platform config updated"
    );

    return res.json({
      success: true,
      message: "Platform configuration updated. Changes take effect on the next order.",
      data: config,
    });
  } catch (error) {
    logger.error({ error: error.message }, "❌ Failed to update platform config");
    return res.status(500).json({ success: false, message: error.message });
  }
};
