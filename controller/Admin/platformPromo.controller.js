import FreeDeliveryPromo from "../../model/promo/FreeDeliveryPromo.js";
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
