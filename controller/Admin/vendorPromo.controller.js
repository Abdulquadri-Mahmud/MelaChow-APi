import mongoose from "mongoose";
import VendorDeliveryPromo from "../../model/promo/VendorDeliveryPromo.js";
import Vendor from "../../model/vendor/vendor.model.js";
import logger from "../../config/logger.js";

const parseAdminLocalDate = (value) => {
  if (!value) return null;
  const raw = String(value);
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw)) return new Date(raw);
  // Admin datetime-local inputs are entered in Nigeria business time.
  // Without an offset, Node may store them as UTC and make promos start one hour late.
  return new Date(`${raw}+01:00`);
};

/**
 * GET /api/admin/promos/vendor-delivery
 * List all vendor delivery promos (newest first).
 * Includes vendor name for display.
 */
export const listVendorDeliveryPromos = async (req, res) => {
  try {
    const promos = await VendorDeliveryPromo.find()
      .sort({ createdAt: -1 })
      .populate("vendorId", "storeName logo")
      .lean();

    return res.json({ success: true, promos });
  } catch (err) {
    logger.error({ error: err.message }, "❌ listVendorDeliveryPromos failed");
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * POST /api/admin/promos/vendor-delivery
 * Create and immediately activate a vendor delivery promo.
 *
 * Body: { vendorId, startsAt, endsAt, maxOrders, adminNote }
 *
 * Business rule enforced here: a vendor may only have ONE active promo
 * at a time. If one already exists and is active, reject the request.
 */
export const createVendorDeliveryPromo = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { vendorId, startsAt, endsAt, maxOrders, adminNote } = req.body;

    if (!vendorId || !startsAt || !endsAt) {
      return res.status(400).json({
        success: false,
        message: "vendorId, startsAt, and endsAt are required",
      });
    }

    const parsedStartsAt = parseAdminLocalDate(startsAt);
    const parsedEndsAt = parseAdminLocalDate(endsAt);

    if (!parsedStartsAt || !parsedEndsAt || Number.isNaN(parsedStartsAt.getTime()) || Number.isNaN(parsedEndsAt.getTime())) {
      return res.status(400).json({
        success: false,
        message: "startsAt and endsAt must be valid dates",
      });
    }

    if (parsedEndsAt <= parsedStartsAt) {
      return res.status(400).json({
        success: false,
        message: "endsAt must be after startsAt",
      });
    }

    const vendor = await Vendor.findById(vendorId).session(session);
    if (!vendor) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }

    // Enforce one active promo per vendor
    const existingActive = await VendorDeliveryPromo.findOne({
      vendorId,
      isActive: true,
    }).session(session);

    if (existingActive) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        success: false,
        message: "This vendor already has an active delivery promo. " +
                 "Deactivate it before creating a new one.",
        existingPromo: existingActive,
      });
    }

    const [promo] = await VendorDeliveryPromo.create(
      [
        {
          vendorId,
          isActive:   true,
          startsAt:   parsedStartsAt,
          endsAt:     parsedEndsAt,
          maxOrders:  maxOrders ? Number(maxOrders) : null,
          usedOrders: 0,
          adminNote:  adminNote || "",
        },
      ],
      { session }
    );

    // Flip the denormalized flag on the vendor document
    await Vendor.findByIdAndUpdate(
      vendorId,
      { hasActiveDeliveryPromo: true },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    logger.info(
      { promoId: promo._id, vendorId },
      "✅ Vendor delivery promo created and activated"
    );

    return res.status(201).json({
      success: true,
      message: "Vendor delivery promo created and activated",
      promo,
    });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    logger.error({ error: err.message }, "❌ createVendorDeliveryPromo failed");
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PATCH /api/admin/promos/vendor-delivery/:promoId/deactivate
 * Deactivate a vendor delivery promo.
 * Also clears the denormalized flag on the vendor.
 */
export const deactivateVendorDeliveryPromo = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { promoId } = req.params;

    const promo = await VendorDeliveryPromo.findById(promoId).session(session);
    if (!promo) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Promo not found" });
    }

    promo.isActive = false;
    await promo.save({ session });

    // Only clear the vendor flag if no other active promo exists for them
    // (safe guard — in practice there should only ever be one)
    const otherActive = await VendorDeliveryPromo.findOne({
      vendorId: promo.vendorId,
      isActive:  true,
      _id:       { $ne: promo._id },
    }).session(session);

    if (!otherActive) {
      await Vendor.findByIdAndUpdate(
        promo.vendorId,
        { hasActiveDeliveryPromo: false },
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    logger.info(
      { promoId: promo._id, vendorId: promo.vendorId },
      "✅ Vendor delivery promo deactivated"
    );

    return res.json({
      success: true,
      message: "Promo deactivated",
      promo,
    });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    logger.error({ error: err.message }, "❌ deactivateVendorDeliveryPromo failed");
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/admin/promos/vendor-delivery/:promoId
 * Get a single promo with full stats.
 */
export const getVendorDeliveryPromo = async (req, res) => {
  try {
    const promo = await VendorDeliveryPromo.findById(req.params.promoId)
      .populate("vendorId", "storeName logo address")
      .lean();

    if (!promo) {
      return res.status(404).json({ success: false, message: "Promo not found" });
    }

    // Calculate remaining orders if capped
    const remaining =
      promo.maxOrders != null
        ? Math.max(0, promo.maxOrders - promo.usedOrders)
        : null;

    return res.json({
      success: true,
      promo: { ...promo, remaining },
    });
  } catch (err) {
    logger.error({ error: err.message }, "❌ getVendorDeliveryPromo failed");
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * GET /api/vendor/promo/delivery-status
 * Vendor reads their own active promo (if any). Read-only.
 * Protected by vendor auth middleware.
 */
export const getVendorOwnPromoStatus = async (req, res) => {
  try {
    const vendorId = req.vendor._id;

    const promo = await VendorDeliveryPromo.findOne({
      vendorId,
      isActive: true,
    }).lean();

    const remaining =
      promo?.maxOrders != null
        ? Math.max(0, promo.maxOrders - promo.usedOrders)
        : null;

    return res.json({
      success:  true,
      hasPromo: !!promo,
      promo:    promo ? { ...promo, remaining } : null,
    });
  } catch (err) {
    logger.error({ error: err.message }, "❌ getVendorOwnPromoStatus failed");
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
