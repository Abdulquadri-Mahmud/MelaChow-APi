import FreeDeliveryPromo from "../../model/promo/FreeDeliveryPromo.js";
import FreeDeliveryClaim from "../../model/promo/FreeDeliveryClaim.js";
import logger from "../../config/logger.js";

// List platform delivery promos
export const listPlatformDeliveryPromos = async (req, res) => {
  try {
    const promos = await FreeDeliveryPromo.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, promos });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to fetch platform delivery promos");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Create a new platform delivery promo (or reactivate existing one)
export const createPlatformDeliveryPromo = async (req, res) => {
  try {
    const { name, totalSlots, startsAt, endsAt } = req.body;

    // We only support one active promo for the entire platform at a time.
    const existingActive = await FreeDeliveryPromo.findOne({ isActive: true });
    if (existingActive) {
      return res.status(400).json({
        success: false,
        message: "A platform delivery promo is already active. Deactivate it first.",
      });
    }

    const newPromo = await FreeDeliveryPromo.create({
      name: name || "first_order_free_delivery",
      totalSlots: Number(totalSlots) || 100,
      usedSlots: 0,
      startsAt: startsAt ? new Date(startsAt) : new Date(),
      endsAt: endsAt ? new Date(endsAt) : null,
      isActive: true,
    });

    res.status(201).json({ success: true, promo: newPromo });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to create platform delivery promo");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Deactivate platform delivery promo
export const deactivatePlatformDeliveryPromo = async (req, res) => {
  try {
    const { promoId } = req.params;

    const promo = await FreeDeliveryPromo.findByIdAndUpdate(
      promoId,
      { isActive: false },
      { new: true }
    );

    if (!promo) {
      return res.status(404).json({ success: false, message: "Promo not found" });
    }

    res.status(200).json({ success: true, promo });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to deactivate platform delivery promo");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
// Get platform promo statistics and usage history
export const getPlatformPromoStats = async (req, res) => {
  try {
    const { promoId } = req.params;

    // 1. Fetch the promo details
    const promo = await FreeDeliveryPromo.findById(promoId);
    if (!promo) {
      return res.status(404).json({ success: false, message: "Promotion not found" });
    }

    // 2. Fetch all claims for this promo with user details
    const claims = await FreeDeliveryClaim.find({ promoId })
      .populate("userId", "firstName lastName email profilePicture")
      .sort({ createdAt: -1 });

    // 3. Aggregate data for charts (Claims per day)
    const statsOverTime = await FreeDeliveryClaim.aggregate([
      { $match: { promoId: promo._id } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
          savings: { $sum: "$deliveryFeeWaived" }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    // 4. Calculate overall metrics
    const totalSavings = claims.reduce((sum, c) => sum + (c.deliveryFeeWaived || 0), 0);

    res.status(200).json({
      success: true,
      stats: {
        promo,
        claims,
        statsOverTime,
        totalSavings,
        totalClaims: claims.length
      }
    });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to fetch platform promo stats");
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * PATCH /api/admin/promos/platform-delivery/:promoId
 * Update fields on an existing platform delivery promo.
 * Allowed fields: totalSlots, startsAt, endsAt, name.
 *
 * Business rules enforced here:
 *   - totalSlots may not be reduced below usedSlots (cannot revoke already-claimed slots)
 *   - endsAt, if provided, must be in the future
 *   - Cannot update a deactivated (isActive: false) promo — reactivate it first
 */
export const updatePlatformDeliveryPromo = async (req, res) => {
  try {
    const { promoId } = req.params;
    const { totalSlots, startsAt, endsAt, name } = req.body;

    const promo = await FreeDeliveryPromo.findById(promoId);
    if (!promo) {
      return res.status(404).json({ success: false, message: "Promo not found" });
    }

    if (!promo.isActive) {
      return res.status(400).json({
        success: false,
        message: "Cannot update a deactivated promo. Reactivate it first.",
      });
    }

    // Validate totalSlots — cannot go below what has already been claimed
    if (totalSlots !== undefined) {
      const newSlots = Number(totalSlots);
      if (isNaN(newSlots) || newSlots < 1) {
        return res.status(400).json({
          success: false,
          message: "totalSlots must be a positive number",
        });
      }
      if (newSlots < promo.usedSlots) {
        return res.status(400).json({
          success: false,
          message: `Cannot reduce totalSlots to ${newSlots} — ${promo.usedSlots} slots have already been claimed`,
        });
      }
      promo.totalSlots = newSlots;
    }

    // Validate endsAt — must be in the future if provided
    if (endsAt !== undefined) {
      const newEndsAt = new Date(endsAt);
      if (isNaN(newEndsAt.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid endsAt date" });
      }
      if (newEndsAt <= new Date()) {
        return res.status(400).json({
          success: false,
          message: "endsAt must be a future date",
        });
      }
      promo.endsAt = newEndsAt;
    }

    if (startsAt !== undefined) {
      const newStartsAt = new Date(startsAt);
      if (isNaN(newStartsAt.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid startsAt date" });
      }
      promo.startsAt = newStartsAt;
    }

    if (name !== undefined && name.trim()) {
      promo.name = name.trim();
    }

    await promo.save();

    logger.info(
      { promoId: promo._id, totalSlots: promo.totalSlots, endsAt: promo.endsAt },
      "✅ Platform delivery promo updated"
    );

    return res.status(200).json({ success: true, promo });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to update platform delivery promo");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * PATCH /api/admin/promos/platform-delivery/:promoId/reactivate
 * Reactivate a previously deactivated platform delivery promo.
 * Business rules:
 *   - Only one active promo may exist at a time — reject if another is active
 *   - Resets usedSlots only if admin explicitly passes resetSlots: true in body
 *   - Does NOT reset usedSlots by default (existing claims remain)
 */
export const reactivatePlatformDeliveryPromo = async (req, res) => {
  try {
    const { promoId } = req.params;
    const { resetSlots = false } = req.body;

    const promo = await FreeDeliveryPromo.findById(promoId);
    if (!promo) {
      return res.status(404).json({ success: false, message: "Promo not found" });
    }

    if (promo.isActive) {
      return res.status(400).json({
        success: false,
        message: "Promo is already active",
      });
    }

    // Enforce one active promo at a time
    const existingActive = await FreeDeliveryPromo.findOne({
      isActive: true,
      _id: { $ne: promoId },
    });

    if (existingActive) {
      return res.status(400).json({
        success: false,
        message: "Another platform promo is already active. Deactivate it first.",
        existingPromo: { _id: existingActive._id, name: existingActive.name },
      });
    }

    promo.isActive = true;
    if (resetSlots) {
      promo.usedSlots = 0;
    }

    await promo.save();

    logger.info(
      { promoId: promo._id, resetSlots },
      "✅ Platform delivery promo reactivated"
    );

    return res.status(200).json({ success: true, promo });
  } catch (error) {
    logger.error({ error: error.message }, "Failed to reactivate platform delivery promo");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
