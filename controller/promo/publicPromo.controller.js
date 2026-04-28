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
      $expr: { $lt: ["$usedSlots", "$totalSlots"] },
      // Respect optional endsAt if set
      $or: [
        { endsAt: null },
        { endsAt: { $gt: now } },
      ],
    })
      .select("totalSlots usedSlots startsAt endsAt")
      .lean();

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
      platformPromo: platformPromo
        ? {
            slotsRemaining: Math.max(0, platformPromo.totalSlots - platformPromo.usedSlots),
            totalSlots:     platformPromo.totalSlots,
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
