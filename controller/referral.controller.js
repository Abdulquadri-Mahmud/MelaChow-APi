import logger from "../config/logger.js";
import {
  attributeReferral,
  getAdminReferralOverview,
  getAvailableRewardCredits,
  getCustomerReferralDashboard,
  getReferralConfig,
  listAdminReferralAttributions,
  reviewAdminReferralAttribution,
  revokeAdminRewardCredit,
  toggleAdminReferralCode,
  updateReferralConfig,
} from "../services/referral.service.js";

// ─── CUSTOMER ENDPOINTS ───────────────────────────────────────────────────────

export const getMyReferrals = async (req, res) => {
  try {
    const userToken = req.postgresUserId || req.userId;
    const data = await getCustomerReferralDashboard(userToken);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Could not load your referral dashboard",
    });
  }
};

export const getMyRewardCredits = async (req, res) => {
  try {
    const userToken = req.postgresUserId || req.userId;
    const [credits, config] = await Promise.all([
      getAvailableRewardCredits(userToken),
      getReferralConfig(),
    ]);
    return res.status(200).json({
      success: true,
      data: {
        ...credits,
        config: {
          enabled: config.enabled,
          creditSpendScope: config.creditSpendScope,
          maxCreditPerOrderNaira: config.maxCreditPerOrderNaira,
          allowStackWithCoupons: config.allowStackWithCoupons,
          allowStackWithFreeDelivery: config.allowStackWithFreeDelivery,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Could not fetch reward credits",
    });
  }
};

export const applyReferralCode = async (req, res) => {
  try {
    const userToken = req.postgresUserId || req.userId;
    const code = req.body?.code;
    if (!code || !String(code).trim()) {
      return res.status(400).json({ success: false, message: "Referral code is required" });
    }

    const deviceId = req.headers["x-melachow-device-id"] || req.body?.deviceId || null;
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || null;

    const result = await attributeReferral({
      refereeUserToken: userToken,
      code,
      deviceId,
      ip,
      phone: req.user?.phone,
      email: req.user?.email,
    });

    if (!result.attributed) {
      return res.status(400).json({
        success: false,
        reason: result.reason,
        message: result.message || "Could not apply referral code",
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      data: {
        code: result.attribution.referralCode,
        status: result.attribution.status,
        expiresAt: result.attribution.expiresAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Could not apply referral code",
    });
  }
};

// ─── SUPER ADMIN ENDPOINTS ────────────────────────────────────────────────────

export const getAdminReferralsConfig = async (_req, res) => {
  try {
    const config = await getReferralConfig();
    return res.status(200).json({ success: true, data: config });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const patchAdminReferralsConfig = async (req, res) => {
  try {
    const updated = await updateReferralConfig(req.postgresAdminId || req.admin?._id, req.body || {});
    return res.status(200).json({
      success: true,
      message: "Referral program configuration updated.",
      data: updated,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const getAdminReferralsOverview = async (_req, res) => {
  try {
    const data = await getAdminReferralOverview();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error({ err: error.message, code: error.code }, "getAdminReferralsOverview failed");
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdminReferralsAttributions = async (req, res) => {
  try {
    const { status = "all", search = "", page = 1, limit = 25 } = req.query;
    const data = await listAdminReferralAttributions({ status, search, page, limit });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error({ err: error.message, code: error.code }, "getAdminReferralsAttributions failed");
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const reviewAdminReferral = async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, reason } = req.body || {};
    const updated = await reviewAdminReferralAttribution({
      attributionId: id,
      adminId: req.postgresAdminId || req.admin?._id,
      decision,
      reason,
    });
    return res.status(200).json({
      success: true,
      message: decision === "approve" ? "Referral approved and reward credit issued." : "Referral rejected.",
      data: updated,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const revokeAdminCredit = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const updated = await revokeAdminRewardCredit({
      creditId: id,
      adminId: req.postgresAdminId || req.admin?._id,
      reason,
    });
    return res.status(200).json({
      success: true,
      message: "Reward credit revoked.",
      data: updated,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const patchAdminUserReferralCode = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive, monthlyCapOverride, disabledReason } = req.body || {};
    const updated = await toggleAdminReferralCode({
      userId,
      isActive,
      monthlyCapOverride,
      disabledReason,
    });
    return res.status(200).json({
      success: true,
      message: "User referral code settings updated.",
      data: updated,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
