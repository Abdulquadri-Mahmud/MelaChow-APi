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
