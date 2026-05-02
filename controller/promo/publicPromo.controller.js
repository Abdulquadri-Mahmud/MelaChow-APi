import FreeDeliveryPromo from "../../model/promo/FreeDeliveryPromo.js";
import VendorDeliveryPromo from "../../model/promo/VendorDeliveryPromo.js";
import logger from "../../config/logger.js";

/**
 * GET /api/promos/active
 * Public endpoint — no auth required.
 * Returns active platform promo and vendor promo summary for banner rendering.
 * Never exposes sensitive fields (adminNote, hashedIp, internal IDs beyond promoId).
 */
export const getActivePromos = async (req, res) => {
  try {
    const now = new Date();

    // 1. Platform promo — at most one active at a time
    const platformPromo = await FreeDeliveryPromo.findOne({
      isActive: true,
      $and: [
        {
          $or: [
            { startsAt: null },
            { startsAt: { $exists: false } },
            { startsAt: { $lte: now } },
          ],
        },
        {
          $or: [
            { endsAt: null },
            { endsAt: { $exists: false } },
            { endsAt: { $gt: now } },
          ],
        },
      ],
    })
      .select("totalSlots usedSlots startsAt endsAt")
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const totalSlots = Number(platformPromo?.totalSlots ?? 100);
    const usedSlots = Number(platformPromo?.usedSlots ?? 0);
    const slotsRemaining = Math.max(0, totalSlots - usedSlots);
    const activePlatformPromo = platformPromo && slotsRemaining > 0;

    // 2. Count of vendors currently running delivery promos
    const vendorPromoCount = await VendorDeliveryPromo.countDocuments({
      isActive: true,
      startsAt: { $lte: now },
      endsAt:   { $gte: now },
      $or: [
        { maxOrders: null },
        { $expr: { $lt: ["$usedOrders", "$maxOrders"] } },
      ],
    });

    return res.json({
      success: true,
      platformPromo: activePlatformPromo
        ? {
            slotsRemaining,
            totalSlots,
            endsAt:         platformPromo.endsAt || null,
          }
        : null,
      vendorPromoCount,
    });
  } catch (err) {
    logger.error({ error: err.message }, "❌ getActivePromos failed");
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
