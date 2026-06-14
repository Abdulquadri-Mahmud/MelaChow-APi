import FreeDeliveryPromo from "../../model/promo/FreeDeliveryPromo.js";
import FreeDeliveryClaim from "../../model/promo/FreeDeliveryClaim.js";
import VendorDeliveryPromo from "../../model/promo/VendorDeliveryPromo.js";
import logger from "../../config/logger.js";
import { buildPromoIdentity } from "../../utils/promoIdentity.js";

/**
 * GET /api/promos/active
 * Public endpoint — no auth required.
 * Returns active platform promo and vendor promo summary for banner rendering.
 * Exposes vendor adminNote as public campaign copy for customer-facing adverts.
 * Never exposes sensitive fields (hashedIp, internal IDs beyond promoId).
 */
export const getActivePromos = async (req, res) => {
  try {
    const now = new Date();
    const adminLocalStartGrace = new Date(now.getTime() + 90 * 60 * 1000);

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
      .select("name totalSlots usedSlots startsAt endsAt")
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    const totalSlots = Number(platformPromo?.totalSlots ?? 100);
    const usedSlots = Number(platformPromo?.usedSlots ?? 0);
    const slotsRemaining = Math.max(0, totalSlots - usedSlots);
    const promoIdentity = buildPromoIdentity({
      deviceId: req.headers["x-melachow-device-id"] || req.query?.deviceId,
      phone: req.user?.phone,
    });
    const claimChecks = [];
    if (req.userId) claimChecks.push({ userId: req.userId });
    if (platformPromo?._id && promoIdentity.hashedDeviceId) {
      claimChecks.push({
        promoId: platformPromo._id,
        hashedDeviceId: promoIdentity.hashedDeviceId,
      });
    }
    if (platformPromo?._id && promoIdentity.phoneHash) {
      claimChecks.push({
        promoId: platformPromo._id,
        phoneHash: promoIdentity.phoneHash,
      });
    }
    const userClaim = claimChecks.length
      ? await FreeDeliveryClaim.findOne({ $or: claimChecks })
          .select("_id")
          .lean()
      : null;
    const activePlatformPromo = platformPromo && slotsRemaining > 0 && !userClaim;

    // 2. Count of vendors currently running delivery promos
    const activeVendorPromoQuery = {
      isActive: true,
      startsAt: { $lte: adminLocalStartGrace },
      endsAt:   { $gte: now },
      $or: [
        { maxOrders: null },
        { $expr: { $lt: ["$usedOrders", "$maxOrders"] } },
      ],
    };

    const [vendorPromoCount, vendorPromos] = await Promise.all([
      VendorDeliveryPromo.countDocuments(activeVendorPromoQuery),
      VendorDeliveryPromo.find(activeVendorPromoQuery)
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(8)
        .select("_id vendorId maxOrders usedOrders startsAt endsAt adminNote")
        .populate("vendorId", "storeName logo address")
        .lean(),
    ]);

    return res.json({
      success: true,
      platformPromo: activePlatformPromo
          ? {
            promoId: platformPromo._id,
            name: platformPromo.name,
            slotsRemaining,
            totalSlots,
            usedSlots,
            startsAt: platformPromo.startsAt || null,
            endsAt: platformPromo.endsAt || null,
            sponsorType: "platform",
            sponsorLabel: "MelaChow",
          }
        : null,
      platformPromoUsed: !!userClaim,
      vendorPromoCount,
      vendorPromos: vendorPromos.map((promo) => ({
        promoId: promo._id,
        vendorId: promo.vendorId?._id || promo.vendorId,
        vendorName: promo.vendorId?.storeName || "Selected restaurant",
        vendorLogo: promo.vendorId?.logo || null,
        adminNote: promo.adminNote || "",
        city: promo.vendorId?.address?.city || null,
        maxOrders: promo.maxOrders,
        usedOrders: promo.usedOrders,
        remainingOrders:
          promo.maxOrders == null
            ? null
            : Math.max(0, Number(promo.maxOrders || 0) - Number(promo.usedOrders || 0)),
        startsAt: promo.startsAt,
        endsAt: promo.endsAt,
        sponsorType: "vendor",
        sponsorLabel: "Restaurant sponsored",
      })),
    });
  } catch (err) {
    logger.error({ error: err.message }, "❌ getActivePromos failed");
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
