import mongoose from "mongoose";
import axios from "axios";
import crypto from "crypto";
import Order from "../../model/order/Order.js";
import VendorOrder from "../../model/vendor/VendorOrder.js";
import MenuItem         from "../../model/menu/MenuItem.js";
import MenuItemPortion  from "../../model/menu/MenuItemPortion.js";
import { MenuItemChoiceGroup, MenuItemChoiceOption }
  from "../../model/menu/MenuItemChoice.js";
import ComboItem from "../../model/menu/ComboItem.js";
import City from "../../model/location/City.js";
import Vendor from "../../model/vendor/vendor.model.js";

import Wallet from "../../model/wallet/wallet.mode.js";
import Admin from "../../model/Admin/admin.model.js";
import discountService from "../../services/discount.service.js";
import { emitNewOrderToRestaurant } from "../../socket/events/orderEvents.js";
import logger from '../../config/logger.js';
import { getPlatformConfig, calculateServiceFee } from '../../services/platformConfig.service.js';

import FreeDeliveryPromo from "../../model/promo/FreeDeliveryPromo.js";
import FreeDeliveryClaim  from "../../model/promo/FreeDeliveryClaim.js";
import VendorDeliveryPromo from "../../model/promo/VendorDeliveryPromo.js";
import VendorDeliveryClaim from "../../model/promo/VendorDeliveryClaim.js";
import { buildPromoIdentity } from "../../utils/promoIdentity.js";
import { orderAutoCancelQueue } from "../../config/queue.js";
import { assertVendorIsOpen } from "../../utils/vendorOpenStatus.js";
import { recordPaymentAttemptEvent } from "../../services/paymentHardening.service.js";
import { generateOrderInvoice } from "../../services/invoice.service.js";
import { usePostgresOrderWrites, usePostgresPaymentWrites } from "../../services/postgres/compat.js";
import { postgresOrderCreationRepository } from "../../services/postgres/orderCreation.repository.js";
import { postgresPaymentRepository } from "../../services/postgres/payment.repository.js";

// Max number of claims allowed from the same IP address.
// Set to 3 to allow legitimate students sharing campus/hostel WiFi
// while still soft-blocking obvious multi-account abuse.
const PROMO_MAX_CLAIMS_PER_IP = 5;
const PROMO_RESERVATION_TTL_MS = 45 * 60 * 1000;
const VENDOR_ORDER_AUTO_CANCEL_DELAY_MS =
  Number(process.env.VENDOR_ORDER_AUTO_CANCEL_MINUTES || 5) * 60 * 1000;

async function queueVendorOrderAutoCancelChecks(order, vendorOrderMapping = {}) {
  const vendorOrderIds = Object.values(vendorOrderMapping).filter(Boolean);
  if (!vendorOrderIds.length) return;

  try {
    for (const vendorOrderId of vendorOrderIds) {
      await orderAutoCancelQueue.add(
        "check-vendor-pending",
        {
          orderId: order._id.toString(),
          orderCode: order.orderId,
          vendorOrderId: vendorOrderId.toString(),
        },
        {
          delay: VENDOR_ORDER_AUTO_CANCEL_DELAY_MS,
          jobId: `vendor-timeout-${vendorOrderId}`,
        }
      );
    }

    logger.info(
      {
        orderId: order.orderId,
        vendorOrderCount: vendorOrderIds.length,
        delayMs: VENDOR_ORDER_AUTO_CANCEL_DELAY_MS,
      },
      "Vendor auto-cancel checks queued"
    );
  } catch (queueErr) {
    logger.error(
      { orderId: order.orderId, error: queueErr.message },
      "Failed to queue vendor auto-cancel checks"
    );
  }
}

async function notifyPaidOrderVendors({ order, restaurantIds, vendorOrderMapping = {}, items = [], totalAmount }) {
  if (!restaurantIds?.length) return;

  let sendVendorNotification;
  try {
    ({ sendVendorNotification } = await import("../../services/notification.service.js"));
  } catch (error) {
    logger.error(
      { orderId: order.orderId, error: error.message },
      "Failed to load vendor notification service"
    );
  }

  for (const restaurantId of restaurantIds) {
    const vendorOrderId = vendorOrderMapping[restaurantId];
    const vendorItems = items.filter((item) => String(item.restaurantId) === String(restaurantId));

    if (sendVendorNotification) {
      try {
        await sendVendorNotification(restaurantId, order.orderId, "vendor_new_order", {
          orderDatabaseId: vendorOrderId || order._id,
          customerName: order.deliveryAddress?.name || "A customer",
          location: order.deliveryAddress?.addressLine || order.deliveryAddress?.address || "specified location",
          totalAmount,
          items: vendorItems,
        });
      } catch (error) {
        logger.error(
          { orderId: order.orderId, restaurantId, vendorOrderId, error: error.message },
          "Vendor persistent notification failed"
        );
      }
    }

    try {
      emitNewOrderToRestaurant({
        ...order.toObject(),
        vendorOrderId,
        restaurantId,
      });
    } catch (error) {
      logger.error(
        { orderId: order.orderId, restaurantId, vendorOrderId, error: error.message },
        "Vendor real-time order emission failed"
      );
    }
  }
}

/**
 * ========================================
 * HELPER: Validate MenuItem Availability
 * ========================================
 */
const validateMenuItemAvailability = (item) => {
  if (item.is_archived) {
    throw new Error(`${item.name} has been removed from the menu`);
  }
  if (!item.is_available) {
    throw new Error(`${item.name} is currently unavailable`);
  }
  if (!item.is_in_stock) {
    throw new Error(`${item.name} is sold out`);
  }
};

/**
 * ========================================
 * HELPER: Validate Portion and Choices
 * ========================================
 */
const validatePortionAndChoices = async (menuItem, cartItem) => {
  // 1. Validate portion exists and belongs to this item
  const portion = await MenuItemPortion.findOne({
    _id:          cartItem.portionId,
    menu_item_id: menuItem._id,
    is_available: true,
  }).lean();

  if (!portion) {
    throw new Error(
      `${menuItem.name}: Invalid or unavailable portion`
    );
  }

  // 2. Validate selected_options against choice groups
  const normalizedChoices = [];
  const selectedOptions = cartItem.selected_options || [];

  if (selectedOptions.length > 0) {
    const groups = await MenuItemChoiceGroup.find({
      menu_item_id: menuItem._id,
    }).lean();

    const groupIds = groups.map(g => g._id);
    const allOptions = await MenuItemChoiceOption.find({
      group_id:     { $in: groupIds },
      is_available: { $ne: false },
    }).lean();

    const optionMap = {};
    allOptions.forEach(o => {
      optionMap[o._id.toString()] = o;
    });

    const groupMap = {};
    groups.forEach(g => {
      groupMap[g._id.toString()] = g;
    });

    for (const sel of selectedOptions) {
      const option = optionMap[sel.option_id?.toString()];
      if (!option) {
        throw new Error(
          `${menuItem.name}: Invalid option "${sel.label}"`
        );
      }
      const group = groupMap[sel.group_id?.toString()];
      if (!group) {
        throw new Error(`${menuItem.name}: Invalid choice group`);
      }
      normalizedChoices.push({
        group_id:             group._id,
        group_name:           group.name,
        option_id:            option._id,
        label:                option.label,
        price_modifier_naira: Math.round(
          (option.price_modifier || 0) / 100
        ),
        quantity:             Number(sel.quantity) || 1,
      });
    }

    // Check required groups have selections
    for (const group of groups) {
      if (!group.is_required) continue;
      const hasSelection = normalizedChoices.some(
        c => c.group_id.toString() === group._id.toString()
      );
      if (!hasSelection) {
        throw new Error(
          `${menuItem.name}: "${group.name}" is required`
        );
      }
    }
  }

  // 3. Calculate price
  // MenuItemPortion.price is stored in KOBO — convert to naira
  // Multiply by portion_quantity so the backend matches what the
  // frontend already sent (portionQty × portion.price) as unitPrice.
  const portionQty   = Number(cartItem.portion_quantity) || 1;
  const basePrice    = (portion.price / 100) * portionQty;
  const optionsTotal = normalizedChoices.reduce(
    (sum, c) => sum + (c.price_modifier_naira || 0) * (c.quantity || 1), 0
  );
  const unitPrice = basePrice + optionsTotal;

  return { unitPrice, normalizedChoices, portion };
};

/**
 * ========================================
 * HELPER: Validate Combo (ComboItem)
 * ========================================
 */
const validateCombo = async (cartItem) => {
  // Support both comboId (new) and variantId (legacy) field names
  const comboLookupId = cartItem.comboId || cartItem.variantId;

  if (!comboLookupId) {
    throw new Error("Combo item requires comboId");
  }

  const combo = await ComboItem.findOne({
    _id:          comboLookupId,
    is_available: true,
    is_archived:  { $ne: true },
  }).lean();

  if (!combo) {
    throw new Error("Combo not found or unavailable");
  }

  // Validate selected_options against embedded choice groups
  const normalizedChoices = [];
  const selectedOptions   = cartItem.selected_options || [];

  if (selectedOptions.length > 0) {
    for (const sel of selectedOptions) {
      const group = combo.choice_groups.find(
        g => g._id.toString() === sel.group_id?.toString()
      );
      if (!group) {
        throw new Error(`Combo: Invalid choice group for option "${sel.label}"`);
      }

      const option = group.options.find(
        o => o._id.toString() === sel.option_id?.toString()
      );
      if (!option) {
        throw new Error(`Combo: Invalid option "${sel.label}"`);
      }
      if (option.is_available === false) {
        throw new Error(`Combo option "${option.label}" is unavailable`);
      }

      normalizedChoices.push({
        group_id:             group._id,
        group_name:           group.name,
        option_id:            option._id,
        label:                option.label,
        price_modifier_naira: Math.round((option.price_modifier || 0) / 100),
        quantity:             Number(sel.quantity) || 1,
      });
    }
  }

  // Enforce required groups
  for (const group of combo.choice_groups) {
    if (!group.is_required) continue;
    const hasSelection = normalizedChoices.some(
      c => c.group_id.toString() === group._id.toString()
    );
    if (!hasSelection) {
      throw new Error(`Combo: "${group.name}" is required`);
    }
  }

  // Price: ComboItem.price is in KOBO — convert to naira
  const basePrice    = combo.price / 100;
  const optionsTotal = normalizedChoices.reduce(
    (sum, c) => sum + (c.price_modifier_naira || 0) * (c.quantity || 1), 0
  );
  const unitPrice = basePrice + optionsTotal;

  return { combo, unitPrice, normalizedChoices };
};


/**
 * Resolve the delivery fee for a vendor.
 * All deliveries are platform-managed. Fee resolution order:
 * 1. platformDeliveryFeeOverride (per-vendor admin override)
 * 2. City.platformDeliveryFee (city-level default)
 * Returns fee in NAIRA.
 */
const resolveVendorDeliveryFee = async (vendor) => {
    if (
        vendor.platformDeliveryFeeOverride != null &&
        vendor.platformDeliveryFeeOverride > 0
    ) {
        return vendor.platformDeliveryFeeOverride;
    }

    const cityName = vendor.address?.city;
    if (!cityName) {
        throw new Error(
            `Vendor "${vendor.storeName}" has no city set on their address. ` +
            `Cannot resolve platform delivery fee.`
        );
    }

    const city = await City.findOne({
        name: { $regex: new RegExp(`^${cityName}$`, "i") },
    }).lean();

    if (!city || city.platformDeliveryFee == null) {
        throw new Error(
            `No platform delivery fee configured for city "${cityName}". ` +
            `Set a fee in the admin City settings before orders can be placed here.`
        );
    }

    return city.platformDeliveryFee;
};

/**
 * SHA-256 hash of an IP address.
 * Never store the raw IP — only the hash.
 */
const hashIp = (rawIp) => {
  return crypto.createHash("sha256").update(rawIp || "unknown").digest("hex");
};

/**
 * Extract the real client IP from the request.
 * Handles proxies (Nginx, Render's edge layer) via x-forwarded-for.
 * Returns "unknown" if no IP can be determined.
 */
const extractIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    // x-forwarded-for can be comma-separated: "client, proxy1, proxy2"
    // First entry is the original client IP
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || "unknown";
};

/**
 * Soft eligibility check for the first-order free delivery promo.
 *
 * Does NOT claim a slot. Slot is reserved atomically inside
 * claimFreeDeliverySlotInSession during order creation.
 *
 * Returns { eligible: false } on any error — never blocks order creation.
 *
 * Gates (fail-fast, in order):
 *   1. Promo exists, isActive, usedSlots < totalSlots
 *   2. originalDeliveryFee > 0 (city fee must be non-zero; if already free, no slot consumed)
 *   3. userId not in FreeDeliveryClaim (hard unique constraint)
 *   4. IP claim count <= PROMO_MAX_CLAIMS_PER_IP (soft fraud signal)
 */
const checkFreeDeliveryEligibility = async (
  userId,
  rawIp,
  originalDeliveryFee,
  session,
  promoIdentity = {}
) => {
  try {
    // Gate 2: Only apply promo if there is actually a fee to waive.
    // If the city fee is already ₦0, do nothing — no slot consumed.
    if (!originalDeliveryFee || originalDeliveryFee <= 0) {
      return { eligible: false, reason: "city_fee_already_zero" };
    }

    const now = new Date();

    // Gate 1: Promo must be active, inside date window, with slots remaining
    const promo = await FreeDeliveryPromo.findOne({
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
            { endsAt: { $gte: now } },
          ],
        },
      ],
      $expr: { $lt: ["$usedSlots", "$totalSlots"] },
    })
      .session(session)
      .lean();

    if (!promo) {
      return { eligible: false, reason: "no_active_promo" };
    }

    const staleBefore = new Date(Date.now() - PROMO_RESERVATION_TTL_MS);
    const { hashedDeviceId, phoneHash } = promoIdentity;
    const identityClaimChecks = [{ userId }];
    if (hashedDeviceId) {
      identityClaimChecks.push({ promoId: promo._id, hashedDeviceId });
    }
    if (phoneHash) {
      identityClaimChecks.push({ promoId: promo._id, phoneHash });
    }

    // Gate 3: the same account, device, or phone must not have a prior
    // successful claim. This blocks creating another account on the same
    // browser/device/phone to claim the promo again.
    const identityClaim = await FreeDeliveryClaim.findOne({
      $or: identityClaimChecks,
    })
      .session(session)
      .lean();

    if (identityClaim) {
      // If a claim exists, check the status of the associated order.
      const claimedOrder = identityClaim.orderId
        ? await Order.findById(identityClaim.orderId).select("paymentStatus orderStatus createdAt").session(session).lean()
        : null;
      const isStalePendingReservation =
        claimedOrder &&
        claimedOrder.paymentStatus === "pending" &&
        claimedOrder.createdAt &&
        claimedOrder.createdAt < staleBefore;

      if (
        claimedOrder &&
        claimedOrder.paymentStatus === "paid" &&
        claimedOrder.orderStatus !== "cancelled"
      ) {
        return { eligible: false, reason: "promo_already_claimed_by_account_device_or_phone" };
      }

      // A fresh pending reservation means the user already has a free-delivery
      // checkout in progress. This prevents opening many free Paystack attempts.
      if (
        claimedOrder &&
        claimedOrder.paymentStatus === "pending" &&
        claimedOrder.orderStatus !== "cancelled" &&
        !isStalePendingReservation
      ) {
        return { eligible: false, reason: "promo_already_reserved_by_account_device_or_phone" };
      }

      // If the order was never created, failed/cancelled, or is an old unpaid
      // Paystack attempt, release the reserved slot and let the user try again.
      await FreeDeliveryClaim.deleteOne({ _id: identityClaim._id }).session(session);
      if (identityClaim.promoId) {
        await FreeDeliveryPromo.updateOne(
          { _id: identityClaim.promoId, usedSlots: { $gt: 0 } },
          { $inc: { usedSlots: -1 } },
          { session }
        );
      }
      logger.info(
        {
          userId,
          staleOrderId: identityClaim.orderId,
          status: claimedOrder?.paymentStatus,
          stalePending: !!isStalePendingReservation,
        },
        "Reclaimed free delivery slot from failed/cancelled prior attempt"
      );
    }

    // Gate 4: IP soft fraud check - allow up to PROMO_MAX_CLAIMS_PER_IP per IP
    const hashedIp = hashIp(rawIp);
    const ipClaimCount = await FreeDeliveryClaim.countDocuments({
      hashedIp,
    });

    if (ipClaimCount >= PROMO_MAX_CLAIMS_PER_IP) {
      logger.warn(
        { hashedIp, ipClaimCount, userId },
        "⚠️ Free delivery promo: IP claim threshold exceeded — soft block applied"
      );
      return { eligible: false, reason: "ip_threshold_exceeded" };
    }

    if (ipClaimCount > 0) {
      // Same IP has been used before but under threshold — log for ops visibility
      logger.warn(
        { hashedIp, ipClaimCount, userId },
        `⚠️ Free delivery promo: IP has ${ipClaimCount} prior claim(s) — allowing (under threshold)`
      );
    }

    return {
      eligible: true,
      promoId:  promo._id,
      hashedIp,
      hashedDeviceId,
      phoneHash,
    };
  } catch (err) {
    // Never block order creation due to promo check failure
    logger.warn(
      { error: err.message },
      "⚠️ Free delivery eligibility check failed — skipping promo"
    );
    return { eligible: false, reason: "check_error" };
  }
};

export const getFreeDeliveryEligibility = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.userId;
    const originalDeliveryFee = Number(
      req.body?.originalDeliveryFee ??
      req.body?.deliveryFee ??
      req.query?.originalDeliveryFee ??
      0
    );
    const rawIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.ip ||
      "unknown";
    const promoIdentity = buildPromoIdentity({
      deviceId: req.body?.deviceId || req.headers["x-melachow-device-id"],
      phone: req.body?.phone || req.user?.phone,
    });

    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const eligibility = await checkFreeDeliveryEligibility(
      userId,
      rawIp,
      originalDeliveryFee,
      session,
      promoIdentity
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      eligible: !!eligibility.eligible,
      reason: eligibility.reason || null,
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    logger.error(
      { error: error.message },
      "Free delivery eligibility endpoint failed"
    );
    return res.status(500).json({
      success: false,
      eligible: false,
      reason: "server_error",
      message: "Unable to check free delivery eligibility",
    });
  }
};

/**
 * Atomically reserve/claim a free delivery slot.
 * Must be called within an active Mongoose session/transaction.
 * Idempotent — returns immediately if order already marked claimed.
 *
 * Strict contract: if this cannot reserve the slot, order creation should
 * fail before the customer pays a zero-delivery total.
 */
const claimFreeDeliverySlotInSession = async (order, session) => {
  if (!order.freeDeliveryPromo?.eligible) return;
  if (order.freeDeliveryPromo?.claimed) return; // idempotency — already done

  const { promoId, hashedIp, hashedDeviceId, phoneHash, originalDeliveryFee } = order.freeDeliveryPromo;

  // Atomic slot increment.
  // Condition prevents going over totalSlots.
  const updatedPromo = await FreeDeliveryPromo.findOneAndUpdate(
    {
      _id:      promoId,
      isActive: true,
      $expr:    { $lt: ["$usedSlots", "$totalSlots"] },
    },
    { $inc: { usedSlots: 1 } },
    { new: true, session }
  );

  if (!updatedPromo) {
    throw new Error("Free delivery promo is no longer available");
  }

  // Create the claim record.
  try {
    await FreeDeliveryClaim.create(
      [
        {
          userId:            order.userId,
          orderId:           order._id,
          hashedIp:          hashedIp || "unknown",
          hashedDeviceId:    hashedDeviceId || null,
          phoneHash:         phoneHash || null,
          deliveryFeeWaived: originalDeliveryFee,
          promoId:           promoId || null,
        },
      ],
      { session }
    );
    logger.info(
      { orderId: order.orderId, feeWaived: originalDeliveryFee },
      "✅ Free delivery claim recorded"
    );
  } catch (dupErr) {
    if (dupErr.code === 11000) {
      throw new Error("You have already used this free delivery promo");
    }
    throw dupErr;
  }

  // Mark order as claimed within the same transaction
  await Order.findByIdAndUpdate(
    order._id,
    { "freeDeliveryPromo.claimed": true },
    { session }
  );
  order.freeDeliveryPromo.claimed = true;
};

/**
 * Check if the vendor in this order has an active sponsored delivery promo.
 *
 * Conditions for promo to apply:
 *   1. Vendor has an active promo (isActive: true)
 *   2. Current time is within [startsAt, endsAt]
 *   3. usedOrders < maxOrders (if maxOrders is set)
 *   4. originalDeliveryFee > 0 (city fee must be non-zero; if already ₦0, nothing to waive)
 *
 * Returns { applicable: false } on any error — never blocks order creation.
 */
const checkVendorDeliveryPromo = async (
  vendorId,
  userId,
  originalDeliveryFee,
  session,
  promoIdentity = {}
) => {
  try {
    // Gate: only apply if there is a fee to waive
    if (!originalDeliveryFee || originalDeliveryFee <= 0) {
      return { applicable: false, reason: "city_fee_already_zero" };
    }

    const now = new Date();

    const promo = await VendorDeliveryPromo.findOne({
      vendorId,
      isActive: true,
      startsAt: { $lte: now },
      endsAt:   { $gte: now },
    })
      .session(session)
      .lean();

    if (!promo) {
      return { applicable: false, reason: "no_active_promo" };
    }

    const { hashedDeviceId, phoneHash } = promoIdentity;
    const identityClaimChecks = [{ promoId: promo._id, userId }];
    if (hashedDeviceId) {
      identityClaimChecks.push({ promoId: promo._id, hashedDeviceId });
    }
    if (phoneHash) {
      identityClaimChecks.push({ promoId: promo._id, phoneHash });
    }

    const existingClaim = await VendorDeliveryClaim.findOne({
      $or: identityClaimChecks,
    })
      .session(session)
      .lean();

    if (existingClaim) {
      const claimedOrder = existingClaim.orderId
        ? await Order.findById(existingClaim.orderId).select("paymentStatus").session(session).lean()
        : null;

      // If the order was paid, or is still pending (not failed/cancelled),
      // the user cannot claim another slot for this vendor promo.
      if (claimedOrder && !["failed", "refunded"].includes(claimedOrder.paymentStatus) && claimedOrder.orderStatus !== "cancelled") {
        return { applicable: false, reason: "vendor_promo_already_claimed_by_account_device_or_phone" };
      }

      // If orphaned or failed, reclaim the slot
      await VendorDeliveryClaim.deleteOne({ _id: existingClaim._id }).session(session);
      if (existingClaim.promoId) {
        await VendorDeliveryPromo.updateOne(
          { _id: existingClaim.promoId, usedOrders: { $gt: 0 } },
          { $inc: { usedOrders: -1 } },
          { session }
        );
      }
      logger.info(
        { userId, vendorId, staleOrderId: existingClaim.orderId },
        "Reclaimed vendor delivery slot from failed/cancelled prior attempt"
      );
    }

    const existingPromoOrder = await Order.findOne({
      userId,
      "vendorDeliveryPromo.promoId": promo._id,
      "vendorDeliveryPromo.applied": true,
      paymentStatus: { $nin: ["failed", "refunded"] },
      orderStatus: { $ne: "cancelled" },
    })
      .session(session)
      .lean();

    if (existingPromoOrder?.paymentStatus === "paid") {
      return { applicable: false, reason: "user_already_used_vendor_promo" };
    }

    // Check order cap if set
    if (promo.maxOrders != null && promo.usedOrders >= promo.maxOrders) {
      // Promo is exhausted — auto-deactivate asynchronously (non-blocking)
      VendorDeliveryPromo.findByIdAndUpdate(promo._id, { isActive: false })
        .then(() =>
          Vendor.findByIdAndUpdate(vendorId, { hasActiveDeliveryPromo: false })
        )
        .catch(e =>
          logger.warn({ error: e.message }, "⚠️ Failed to auto-deactivate exhausted promo")
        );

      return { applicable: false, reason: "promo_exhausted" };
    }

    return {
      applicable: true,
      promoId:    promo._id,
      hashedDeviceId,
      phoneHash,
    };
  } catch (err) {
    logger.warn(
      { error: err.message, vendorId },
      "⚠️ Vendor promo check failed — skipping vendor promo"
    );
    return { applicable: false, reason: "check_error" };
  }
};

/**
 * Atomically increment usedOrders on a VendorDeliveryPromo after
 * payment is confirmed.
 *
 * Must be called within an active Mongoose session.
 * Non-fatal — never blocks payment confirmation.
 * Also auto-deactivates the promo if this increment hits the maxOrders cap.
 */
const recordVendorPromoUsage = async (order, session) => {
  if (!order.vendorDeliveryPromo?.applied) return;
  if (order.vendorDeliveryPromo?.claimed) return;

  const { promoId, vendorId, hashedDeviceId, phoneHash, originalDeliveryFee } = order.vendorDeliveryPromo;
  if (!promoId) return;

  const updatedPromo = await VendorDeliveryPromo.findOneAndUpdate(
    {
      _id: promoId,
      isActive: true,
      $or: [
        { maxOrders: null },
        { $expr: { $lt: ["$usedOrders", "$maxOrders"] } },
      ],
    },
    { $inc: { usedOrders: 1 } },
    { new: true, session }
  );

  if (!updatedPromo) {
    throw new Error("Vendor delivery promo is no longer available");
  }

  try {
    await VendorDeliveryClaim.create(
      [
        {
          promoId,
          vendorId,
          userId: order.userId,
          orderId: order._id,
          deliveryFeeWaived: originalDeliveryFee || 0,
          hashedDeviceId: hashedDeviceId || null,
          phoneHash: phoneHash || null,
        },
      ],
      { session }
    );
  } catch (claimErr) {
    if (claimErr.code === 11000) {
      throw new Error("You have already used this restaurant free delivery promo");
    }
    throw claimErr;
  }

  await Order.findByIdAndUpdate(
    order._id,
    { "vendorDeliveryPromo.claimed": true },
    { session }
  );
  order.vendorDeliveryPromo.claimed = true;

  logger.info(
    { promoId, orderId: order.orderId, usedOrders: updatedPromo.usedOrders },
    "✅ Vendor promo usage recorded"
  );

  // Auto-deactivate if cap reached — outside session (non-blocking)
  if (
    updatedPromo.maxOrders != null &&
    updatedPromo.usedOrders >= updatedPromo.maxOrders
  ) {
    VendorDeliveryPromo.findByIdAndUpdate(promoId, { isActive: false })
      .then(() =>
        Vendor.findByIdAndUpdate(vendorId, { hasActiveDeliveryPromo: false })
      )
      .catch(e =>
        logger.warn({ error: e.message }, "⚠️ Auto-deactivation failed after cap reached")
      );

    logger.info(
      { promoId, vendorId },
      "🏁 Vendor promo exhausted and auto-deactivated"
    );
  }
};

export const releasePromoReservationsForOrder = async (orderIdOrDoc) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = orderIdOrDoc?._id
      ? await Order.findById(orderIdOrDoc._id).session(session)
      : await Order.findById(orderIdOrDoc).session(session);

    if (!order || order.paymentStatus === "paid") {
      await session.commitTransaction();
      session.endSession();
      return;
    }

    if (order.freeDeliveryPromo?.eligible && order.freeDeliveryPromo?.claimed) {
      const claimDelete = await FreeDeliveryClaim.deleteOne({
        orderId: order._id,
      }).session(session);

      if (claimDelete.deletedCount > 0 && order.freeDeliveryPromo.promoId) {
        await FreeDeliveryPromo.updateOne(
          { _id: order.freeDeliveryPromo.promoId, usedSlots: { $gt: 0 } },
          { $inc: { usedSlots: -1 } },
          { session }
        );
      }

      order.freeDeliveryPromo.claimed = false;
    }

    if (order.vendorDeliveryPromo?.applied && order.vendorDeliveryPromo?.claimed) {
      const claimDelete = await VendorDeliveryClaim.deleteOne({
        orderId: order._id,
      }).session(session);

      if (claimDelete.deletedCount > 0 && order.vendorDeliveryPromo.promoId) {
        await VendorDeliveryPromo.updateOne(
          { _id: order.vendorDeliveryPromo.promoId, usedOrders: { $gt: 0 } },
          { $inc: { usedOrders: -1 } },
          { session }
        );
      }

      order.vendorDeliveryPromo.claimed = false;
    }

    await order.save({ session });
    await session.commitTransaction();
    session.endSession();
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    logger.error(
      { orderId: orderIdOrDoc?._id || orderIdOrDoc, error: error.message },
      "Failed to release promo reservation"
    );
  }
};

/**
 * ========================================
 * HELPER: Generate Order ID
 * ========================================
 */
export const generateOrderId = () => {
    return `ORD-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
};

/**
 * ========================================
 * MAIN: Create Order V2
 * ========================================
 * Accepts normalized frontend payload
 * Validates and recalculates all prices server-side
 */
export const createOrderV2 = async ({
    userId,
    items,
    vendorDeliveryFees,
    deliveryAddress,
    phone,
    discountCode = null, // Optional discount code
    useWallet = false,   // Optional wallet payment
    paymentReference = null,
    paymentStatus = "pending",
    orderId = null,
    idempotencyKey = null, // ← ADD THIS
    clientIp = null,
    deviceId = null,
}) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        /* ========================================
         * 0️⃣ IDEMPOTENCY CHECK
         * If this key was already used to create an order,
         * return that order immediately without creating
         * a duplicate.
         * ======================================== */
        if (idempotencyKey) {
            const existingOrder = await Order.findOne({
                idempotencyKey
            }).session(session);

            if (existingOrder) {
                await session.abortTransaction();
                session.endSession();
                console.log(
                    `⚡ Idempotent order return: ${existingOrder.orderId}`
                );
                return existingOrder;
            }
        }
        /* ========================================
         * 1️⃣ VALIDATION
         * ======================================== */
        if (!userId) throw new Error("User ID is required");
        const promoIdentity = buildPromoIdentity({ deviceId, phone });
        if (!Array.isArray(items) || items.length === 0) {
            throw new Error("Order items are required");
        }
        if (!deliveryAddress) throw new Error("Delivery address is required");
        if (!phone) throw new Error("Phone number is required");
        if (!Array.isArray(vendorDeliveryFees) || vendorDeliveryFees.length === 0) {
            throw new Error("Vendor delivery fees are required");
        }

        /* ========================================
         * 2️⃣ FETCH ALL MENUITEMS
         * Only fetch regular food items here.
         * Combos are fetched individually in STEP 3
         * via the validateCombo helper.
         * ======================================== */
        const foodItems = items.filter(
          i => i.type === "item" || (!i.type && i.foodId && !i.variantId)
        );
        // comboItems are validated individually in STEP 3
        // via validateCombo — no bulk pre-fetch needed

        const menuItemIds = foodItems
          .map(i => i.foodId)
          .filter(Boolean);

        const menuItems = menuItemIds.length > 0
          ? await MenuItem.find({
              _id:         { $in: menuItemIds },
              is_archived: false,
            }).session(session).lean()
          : [];

        if (menuItems.length !== menuItemIds.length) {
          throw new Error("One or more food items not found");
        }

        const menuItemMap = {};
        menuItems.forEach(m => {
          menuItemMap[m._id.toString()] = m;
        });

        /* ========================================
         * 3️⃣ VALIDATE & NORMALIZE ITEMS
         * Branches on item.type:
         *   "item"  → MenuItem + MenuItemPortion path
         *   "combo" → MenuVariant path
         * ======================================== */
        const normalizedItems = [];
        const vendorItemsMap  = {};

        for (let i = 0; i < items.length; i++) {
          const cartItem = items[i];

          if (!cartItem.restaurantId) {
            throw new Error(`Item ${i}: restaurantId is required`);
          }
          if (!cartItem.quantity || cartItem.quantity < 1) {
            throw new Error(`Item ${i}: quantity must be at least 1`);
          }
          
          const isCombo =
            cartItem.type === "combo" ||
            (!cartItem.type && (cartItem.comboId || cartItem.variantId) && !cartItem.foodId);

          let normalizedItem;

          if (isCombo) {
            // ── COMBO ITEM ────────────────────────────────
            // Support both comboId (new) and variantId (legacy)
            if (!cartItem.comboId && !cartItem.variantId) {
              throw new Error(`Item ${i}: comboId required for combo`);
            }

            const {
              combo,
              unitPrice,
              normalizedChoices,
            } = await validateCombo(cartItem);

            normalizedItem = {
              type:         "combo",
              variantId:    combo._id,   // stored as variantId in Order schema
              comboId:      combo._id,   // explicit for future use
              foodId:       null,
              portionId:    null,

              portion_label:    "",
              portion_quantity: 1,
              dietary_type:     combo.dietary_type || "",
              item_type:        "combo",
              storeName:        cartItem.storeName || "",

              selected_options: normalizedChoices.map(c => ({
                group_id:             c.group_id,
                group_name:           c.group_name,
                option_id:            c.option_id,
                label:                c.label,
                price_modifier_naira: c.price_modifier_naira || 0,
                quantity:             c.quantity || 1,
              })),

              restaurantId: cartItem.restaurantId,
              name:         combo.name,
              image_url:    combo.image_url || "",
              variant: {
                name:  combo.name,
                price: unitPrice,
                image: combo.image_url || "",
              },
              quantity: Number(cartItem.quantity),
              price:    unitPrice,
              note:     cartItem.note || "",

              metadata: {
                type:             "combo",
                selected_options: normalizedChoices,
                pricing: {
                  base_naira:         combo.price / 100,
                  options_total_naira: normalizedChoices.reduce(
                    (s, c) => s + c.price_modifier_naira * (c.quantity || 1), 0
                  ),
                  final_unit_naira: unitPrice,
                },
              },
            };

          } else {
            // ── REGULAR FOOD ITEM ─────────────────────────
            if (!cartItem.foodId) {
              throw new Error(`Item ${i}: foodId required`);
            }
            if (!cartItem.portionId) {
              throw new Error(
                `Item ${i}: portionId required — select a portion size`
              );
            }

            const menuItem = menuItemMap[cartItem.foodId.toString()];
            if (!menuItem) {
              throw new Error(`Item ${i}: Food not found`);
            }

            // Confirm the item belongs to the stated restaurant
            if (menuItem.vendor_id?.toString() !== cartItem.restaurantId.toString()) {
              throw new Error(
                `Item ${i}: Food does not belong to this restaurant`
              );
            }

            // Check is_available, is_in_stock, is_archived
            validateMenuItemAvailability(menuItem);

            // Validate portion + choice options, derive server-side price
            const { unitPrice, normalizedChoices, portion } =
              await validatePortionAndChoices(menuItem, cartItem);

            normalizedItem = {
              type:         "item",
              foodId:       menuItem._id,
              variantId:    null,

              // ── New explicit fields ──
              portionId:        portion._id,
              portion_label:    portion.label,
              portion_quantity: Number(cartItem.portion_quantity) || 1,
              dietary_type:     menuItem.dietary_type || "",
              item_type:        menuItem.item_type    || "",
              storeName:        cartItem.storeName    || "",

              // ── Selected options as explicit array ──
              // Mirrors metadata.selected_options for queryability
              selected_options: normalizedChoices.map(c => ({
                group_id:             c.group_id,
                group_name:           c.group_name,
                option_id:            c.option_id,
                label:                c.label,
                price_modifier_naira: c.price_modifier_naira || 0,
                quantity:             c.quantity || 1,
              })),

              restaurantId: cartItem.restaurantId,
              name:         menuItem.name,
              image_url:    menuItem.image_url || "",
              variant: {
                name:  portion.label,
                price: unitPrice,
                image: menuItem.image_url || "",
              },
              quantity: Number(cartItem.quantity),
              price:    unitPrice,
              note:     cartItem.note || "",

              // ── metadata retained for backward compatibility ──
              metadata: {
                type:             "item",
                portionId:        portion._id,
                portion_label:    portion.label,
                selected_options: normalizedChoices,
                dietary_type:     menuItem.dietary_type || "",
                item_type:        menuItem.item_type    || "",
                pricing: {
                  base_naira:    (portion.price / 100) * (Number(cartItem.portion_quantity) || 1),
                  options_total: normalizedChoices.reduce(
                    (s, c) => s + c.price_modifier_naira, 0
                  ),
                  final_unit_naira: unitPrice,
                },
              },
            };
          }

          normalizedItems.push(normalizedItem);

          // Group by vendor for VendorOrder creation
          const vendorId = String(cartItem.restaurantId);
          if (!vendorItemsMap[vendorId]) vendorItemsMap[vendorId] = [];
          vendorItemsMap[vendorId].push(normalizedItem);
        }


        /* ========================================
         * 3.5️⃣ SINGLE-VENDOR ENFORCEMENT
         * MelaChow MVP supports one restaurant per order.
         * Multi-vendor orders create rider assignment conflicts
         * and escrow complexity that are out of scope pre-launch.
         * Remove this block when multi-vendor is deliberately implemented.
         * ======================================== */
        const uniqueVendorIds = Object.keys(vendorItemsMap);
        if (uniqueVendorIds.length > 1) {
            throw new Error(
                "Orders can only contain items from one restaurant at a time. " +
                "Please place separate orders for each restaurant."
            );
        }

        /* ========================================
         * 4️⃣ CALCULATE SUBTOTAL
         * ======================================== */
        const subtotal = normalizedItems.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
        );

        /* ========================================
         * 5️⃣ VALIDATE & RESOLVE DELIVERY FEES
         * Do NOT trust frontend fee amounts.
         * Re-fetch each vendor and resolve the correct
         * fee server-side. Frontend value is used only
         * as a sanity reference for logging.
         * ======================================== */
        const deliveryFeeMap = {};
        let totalDeliveryFee = 0;

        // Bulk fetch all unique vendors in this order (using uniqueVendorIds defined above)

        const vendorsForFees = await Vendor.find({
          _id: { $in: uniqueVendorIds },
        }).select(
          "storeName platformDeliveryFeeOverride address openingHours"
        ).lean();

        if (vendorsForFees.length !== uniqueVendorIds.length) {
          throw new Error("One or more restaurants not found");
        }

        // Build a map of frontend-submitted fees for comparison
        const frontendFeeMap = {};
        for (const vf of vendorDeliveryFees) {
          frontendFeeMap[String(vf.restaurantId)] = Number(vf.deliveryFee);
        }

        // Resolve correct fee per vendor from DB
        for (const vendor of vendorsForFees) {
          const vendorId = vendor._id.toString();

          assertVendorIsOpen(vendor);

          if (!frontendFeeMap.hasOwnProperty(vendorId)) {
            throw new Error(
              `Missing delivery fee for restaurant ${vendor.storeName}`
            );
          }

          // Server-derived authoritative fee
          const resolvedFee = await resolveVendorDeliveryFee(vendor);

          // Log mismatch for ops visibility but use server value
          const frontendFee = frontendFeeMap[vendorId];
          if (frontendFee !== resolvedFee) {
            console.warn(
              `⚠️ Delivery fee mismatch for ${vendor.storeName}: ` +
              `frontend sent ₦${frontendFee}, server resolved ₦${resolvedFee}. ` +
              `Using server value.`
            );
          }

          deliveryFeeMap[vendorId] = resolvedFee;
          totalDeliveryFee += resolvedFee;
        }

        /* ========================================
         * 5.5️⃣ DELIVERY PROMO RESOLUTION
         *
         * Priority order:
         *   1. Vendor-sponsored promo (checked first — vendor paid for this)
         *   2. Platform first-order promo (only if vendor promo does not apply)
         *
         * If vendor promo applies, platform promo is skipped entirely —
         * do not waste a platform slot on an already-free delivery.
         *
         * originalTotalDeliveryFee is captured BEFORE any override.
         * ======================================== */
        const originalTotalDeliveryFee = totalDeliveryFee;
        let promoEligibilityResult    = { eligible:    false };
        let vendorPromoResult          = { applicable:  false };

        // MVP enforces single-vendor orders (uniqueVendorIds.length === 1).
        // The vendor promo check targets that single vendor.
        const singleVendorId = uniqueVendorIds[0];

        // PRIORITY 1: Vendor-sponsored promo
        if (singleVendorId) {
          vendorPromoResult = await checkVendorDeliveryPromo(
            singleVendorId,
            userId,
            originalTotalDeliveryFee,
            session,
            promoIdentity
          );

          if (vendorPromoResult.applicable) {
            totalDeliveryFee = 0;
            for (const vid of Object.keys(deliveryFeeMap)) {
              deliveryFeeMap[vid] = 0;
            }
            logger.info(
              { vendorId: singleVendorId, originalFee: originalTotalDeliveryFee },
              "🏪 Vendor-sponsored free delivery applied"
            );
          }
        }

        // PRIORITY 2: Platform first-order promo
        // Only run if vendor promo did NOT already zero the fee
        if (!vendorPromoResult.applicable) {
          promoEligibilityResult = await checkFreeDeliveryEligibility(
            userId,
            clientIp,
            originalTotalDeliveryFee,
            session,
            promoIdentity
          );

          if (promoEligibilityResult.eligible) {
            totalDeliveryFee = 0;
            for (const vid of Object.keys(deliveryFeeMap)) {
              deliveryFeeMap[vid] = 0;
            }
            logger.info(
              { userId, originalFee: originalTotalDeliveryFee },
              "🎁 Platform first-order free delivery applied"
            );
          }
        }

        // ── SECTION 6: SERVICE FEE ─────────────────────────────────────────
        // Fetch config once per order (single indexed document lookup).
        const platformConfig = await getPlatformConfig();
        // Free delivery promos cover delivery only; service fee still applies when enabled.
        const serviceFee = calculateServiceFee(
            platformConfig,
            subtotal        // fee is on food subtotal, not including delivery
        );

        if (serviceFee > 0) {
            logger.info(
                { userId, serviceFee, type: platformConfig.serviceFeeType },
                "💳 Service fee applied to order"
            );
        }

        // --- 7️⃣ DISCOUNT LOGIC ---
        let finalTotal = Number((subtotal + totalDeliveryFee + serviceFee).toFixed(2));
        let appliedDiscount = null;

        if (discountCode) {
            // Determine vendor context (if single vendor order)
            const discountVendorIds = [...new Set(normalizedItems.map(i => String(i.restaurantId)))];
            const vendorIdContext = discountVendorIds.length === 1 ? discountVendorIds[0] : null;

            // Validate
            const validation = await discountService.validateDiscount(discountCode, {
                userId,
                vendorId: vendorIdContext,
                subtotal: subtotal,
                items: normalizedItems,
                hashedDeviceId: promoIdentity.hashedDeviceId,
                phoneHash: promoIdentity.phoneHash,
            });

            if (!validation.valid) {
                throw new Error(`Discount Error: ${validation.error}`);
            }

            // Calculate
            const calculation = await discountService.calculateFinalPrice(
                { subtotal, deliveryFee: totalDeliveryFee, items: normalizedItems },
                validation.discount
            );

            finalTotal = calculation.total;
            appliedDiscount = calculation.appliedDiscount;

            // Reserve discount usage with the same account/device/phone identity
            // used during validation. This prevents a second account on the
            // same device/phone from using the same promo.
            const usageUpdate = await discountService.recordDiscountUsage(
                validation.discount._id,
                {
                    userId,
                    hashedDeviceId: promoIdentity.hashedDeviceId,
                    phoneHash: promoIdentity.phoneHash,
                },
                session
            );

            if (usageUpdate.modifiedCount !== 1) {
                throw new Error("Discount Error: Discount usage limit reached");
            }
        }

        const total = finalTotal;

        /* ========================================
         * 7️⃣ WALLET PAYMENT (OPTIONAL)
         * ======================================== */
        // Calculate Order ID early for reference
        const finalOrderId = orderId || generateOrderId();
        let finalPaymentStatus = paymentStatus; // "pending" by default
        let finalPaymentRef = paymentReference;

        if (useWallet) {
            const userWallet = await Wallet.findOne({ ownerId: userId, ownerModel: "User" }).session(session);

            if (!userWallet) {
                throw new Error("Wallet not found. Please fund your wallet first.");
            }

            if (userWallet.balance < total) {
                throw new Error(`Insufficient wallet balance (₦${userWallet.balance}) for total ₦${total}`);
            }

            // Deduct from wallet
            userWallet.balance -= total;
            userWallet.transactions.push({
                type: "debit",
                amount: total,
                description: `Payment for order ${finalOrderId}`,
                date: new Date(),
                transactionType: 'order_payment',
            });
            await userWallet.save({ session });

            // Mark as successful payment
            finalPaymentStatus = "paid";
            finalPaymentRef = `WALLET_${finalOrderId}`;
        }

        /* ========================================
         * 8️⃣ CREATE ORDER
         * ======================================== */
        // Normalize deliveryAddress field names.
        // Frontend sends cityName/stateName per API contract.
        // Order schema stores city/state.
        // Map here so both the schema and the frontend
        // contract stay valid without changing either.
        const normalizedDeliveryAddress = {
          ...deliveryAddress,
          city:  deliveryAddress.cityName  || deliveryAddress.city  || "",
          state: deliveryAddress.stateName || deliveryAddress.state || "",
        };
        // Keep cityName/stateName as well for forwards
        // compatibility — they are stored but not required

        // Build resolved vendorDeliveryFees for storage
        const resolvedVendorDeliveryFees = uniqueVendorIds.map(
          vendorId => ({
            restaurantId: vendorId,
            deliveryFee:  deliveryFeeMap[vendorId],
          })
        );

        let order;
        try {
            const [created] = await Order.create(
                [
                    {
                        orderId: finalOrderId,
                        idempotencyKey: idempotencyKey || undefined, // undefined for sparse index
                        userId,
                        items: normalizedItems,
                        vendorDeliveryFees: resolvedVendorDeliveryFees, // ← use resolved
                        deliveryAddress: normalizedDeliveryAddress,
                        phone,
                        subtotal: Number(subtotal.toFixed(2)),
                        deliveryFee: Number(totalDeliveryFee.toFixed(2)),
                        serviceFee: serviceFee,
                        total,
                        appliedDiscount, // Persist discount snapshot
                        paymentReference: finalPaymentRef,
                        paymentStatus: finalPaymentStatus, // "paid" if wallet used
                        orderStatus: "pending",
                        freeDeliveryPromo: promoEligibilityResult.eligible
                            ? {
                                eligible:            true,
                                claimed:             false,
                                promoId:             promoEligibilityResult.promoId,
                                hashedIp:            promoEligibilityResult.hashedIp,
                                hashedDeviceId:      promoEligibilityResult.hashedDeviceId,
                                phoneHash:           promoEligibilityResult.phoneHash,
                                originalDeliveryFee: originalTotalDeliveryFee,
                              }
                            : { 
                                eligible: false,
                                reason: promoEligibilityResult.reason 
                              },
                        vendorDeliveryPromo: vendorPromoResult.applicable
                            ? {
                                applied:             true,
                                claimed:             false,
                                promoId:             vendorPromoResult.promoId,
                                vendorId:            singleVendorId,
                                hashedDeviceId:      vendorPromoResult.hashedDeviceId,
                                phoneHash:           vendorPromoResult.phoneHash,
                                originalDeliveryFee: originalTotalDeliveryFee,
                              }
                            : { 
                                applied: false,
                                reason: vendorPromoResult.reason
                              },
                    }
                ],
                { session }
            );
            order = created;
        } catch (createErr) {
            if (
                createErr.code === 11000 &&
                createErr.keyPattern?.idempotencyKey
            ) {
                // Race condition — another request won.
                await session.abortTransaction();
                session.endSession();
                console.log(
                    `⚡ Idempotent race resolved for key: ${idempotencyKey}`
                );
                const existing = await Order.findOne({ idempotencyKey });
                return existing;
            }
            throw createErr;
        }

        // 9️⃣ ATOMIC FULFILLMENT (For Wallet Payments)
        // If paid by wallet, we MUST fulfill (distribute funds) immediately within the same transaction
        // Reserve promo slots before payment starts. If Paystack fails, the
        // reservation is released; if the user abandons payment, stale cleanup
        // releases it on the next checkout attempt.
        if (order.freeDeliveryPromo?.eligible) {
            await claimFreeDeliverySlotInSession(order, session);
        }

        if (order.vendorDeliveryPromo?.applied) {
            await recordVendorPromoUsage(order, session);
        }

        let vendorOrderMapping = {};
        if (useWallet) {
            vendorOrderMapping = await createVendorOrdersAndUpdateWallets(order, session);
            await generateOrderInvoice(order, { session });
        }

        await session.commitTransaction();
        session.endSession();

        console.log(`✅ Order created successfully: ${finalOrderId} (status: pending)`);

        // 🔔 Send notifications AFTER transaction commits
        if (order.paymentStatus === 'paid') {
            await queueVendorOrderAutoCancelChecks(order, vendorOrderMapping);
        }

        const restaurantIds = [...new Set(normalizedItems.map(item => String(item.restaurantId)))];

        try {
            const { sendOrderNotification } = await import('../../services/notification.service.js');

            // 1. Notify Customer
            // Get restaurant names for the notification
            const vendors = await Vendor.find({ _id: { $in: restaurantIds } }).select('storeName');
            const restaurantNames = vendors.map(v => v.storeName).join(', ');

            const customerStatus = order.paymentStatus === 'paid' ? 'accepted' : 'pending';
            await sendOrderNotification(userId, finalOrderId, customerStatus, {
                orderDatabaseId: order._id,
                restaurantName: restaurantNames,
                totalAmount: total,
                itemCount: normalizedItems.length,
                items: normalizedItems.map(item => ({
                    name: item.variant.name,
                    quantity: item.quantity
                }))
            });

            // Vendor notifications are emitted after this block so customer failures cannot suppress them.

            console.log(`Customer notification sent for order ${finalOrderId}`);
        } catch (notifError) {
            console.error('❌ Failed to send notifications:', notifError.message);
            // Don't throw - notification failure shouldn't block order creation
        }

        if (order.paymentStatus === 'paid') {
            await notifyPaidOrderVendors({
                order,
                restaurantIds,
                vendorOrderMapping,
                items: normalizedItems,
                totalAmount: total
            });
        }

        return order;

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        console.error("❌ CreateOrderV2 failed:", error.message);
        throw error;
    }
};

/**
 * ========================================
 * HELPER: Create Vendor Orders and Update Wallets
 * ========================================
 * Extracted from createOrderV2 for reusability
 * Called AFTER payment verification
 */
export const createVendorOrdersAndUpdateWallets = async (order, session) => {
    // ── Fetch platform config for commission rate ───────────────────────────
    // Commission is 0 at launch (vendor trust phase). Admin enables it from
    // dashboard when ready. Reading from DB means no redeploy needed.
    const platformConfig = await getPlatformConfig();
    const PLATFORM_COMMISSION = platformConfig.commissionEnabled
        ? platformConfig.commissionRate / 100
        : 0;

    // Group items by vendor
    const vendorItemsMap = {};
    order.items.forEach(item => {
        const vendorId = String(item.restaurantId);
        if (!vendorItemsMap[vendorId]) {
            vendorItemsMap[vendorId] = [];
        }
        vendorItemsMap[vendorId].push(item);
    });

    // Map delivery fees
    const deliveryFeeMap = {};
    order.vendorDeliveryFees.forEach(v => {
        deliveryFeeMap[String(v.restaurantId)] = v.deliveryFee;
    });

    const vendorIds = Object.keys(vendorItemsMap);

    const vendorOrderMapping = {};

    // Get admin wallet early to handle delivery fee routing
    let adminWallet = await Wallet.findOne({
        ownerModel: "Admin"
    }).session(session);

    if (!adminWallet) {
        const adminUser = await Admin.findOne().session(session);
        if (adminUser) {
            [adminWallet] = await Wallet.create(
                [{ ownerId: adminUser._id, ownerModel: "Admin", balance: 0, transactions: [] }],
                { session }
            );
        }
    }

    // Process each vendor
    for (const vendorId of vendorIds) {
        // ... (lines 611-631)
        const vendorItems = vendorItemsMap[vendorId];
        const vendorSubtotal = vendorItems.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
        );

        const vendorDeliveryShare = deliveryFeeMap[vendorId] || 0;
        const commission = Number((vendorSubtotal * PLATFORM_COMMISSION).toFixed(2));
        const vendorTotal = Number((vendorSubtotal - commission).toFixed(2));

        // Check if VendorOrder already exists (idempotency)
        const existingVendorOrder = await VendorOrder.findOne({
            restaurantId: vendorId,
            userOrderId: order._id
        }).session(session);

        if (existingVendorOrder) {
            console.log(`⚠️ VendorOrder already exists for vendor ${vendorId}, order ${order.orderId}`);
            vendorOrderMapping[vendorId] = existingVendorOrder._id;
            continue;
        }

        // ── ESCROW: Hold vendor food revenue in admin wallet until delivery ──
        // All deliveries are platform-managed. Vendor earns food revenue only.
        // Delivery fee is retained by the platform — never escrowed to vendor.
        const escrowAmount = Number(vendorTotal.toFixed(2));

        // Create VendorOrder
        const [vendorOrder] = await VendorOrder.create(
            [
                {
                    restaurantId: vendorId,
                    userOrderId: order._id,
                    items: vendorItems.map(item => ({
                      // ── Type & References ──
                      type:      item.type      || "item",
                      foodId:    item.foodId    || null,
                      variantId: item.variantId || null,
                      portionId: item.portionId || null,

                      // ── Display fields ──
                      name:          item.name          || "",
                      image_url:     item.image_url     || "",
                      portion_label: item.portion_label || "",
                      storeName:     item.storeName     || "",
                      variant:       item.variant       || {},

                      // ── Quantities ──
                      quantity:         item.quantity         || 1,
                      portion_quantity: item.portion_quantity || 1,

                      // ── Pricing ──
                      originalPrice: item.price,
                      vendorEarning: Number(item.price.toFixed(2)), // 100% to vendor — no commission deducted

                      // ── Dietary & category ──
                      dietary_type: item.dietary_type || "",
                      item_type:    item.item_type    || "",

                      // ── Selected options ──
                      selected_options: item.selected_options || [],

                      note: item.note || "",

                      // ── Backward compatibility ──
                      metadata: item.metadata || {},
                    })),
                    commission,
                    vendorTotal,
                    // Platform handles all deliveries. Vendor earns food revenue only.
                    deliveryShare: 0,
                    escrowAmount,
                    escrowReleased: false,
                    orderStatus: "pending"
                }
            ],
            { session }
        );

        console.log(`✅ VendorOrder created with explicit item fields for vendor ${vendorId}`);

        vendorOrderMapping[vendorId] = vendorOrder._id;

        // Update vendor stats
        await Vendor.findByIdAndUpdate(
            vendorId,
            {
                $push: { vendorOrders: vendorOrder._id },
                $inc: {
                    totalOrders: 1,
                    totalSales: vendorSubtotal
                }
            },
            { session }
        );

        if (adminWallet) {
            // Hold vendor food revenue in escrow until delivery confirmed
            adminWallet.balance = Number((adminWallet.balance + escrowAmount).toFixed(2));
            adminWallet.transactions.push({
                type: "credit",
                amount: escrowAmount,
                description: `Escrow: vendor food revenue held for Order ${order.orderId}`,
                orderId: order._id,
                transactionType: 'escrow_hold',
            });

            // Platform always retains the delivery fee — credit immediately
            if (vendorDeliveryShare > 0) {
                adminWallet.balance = Number((adminWallet.balance + vendorDeliveryShare).toFixed(2));
                adminWallet.transactions.push({
                    type: "credit",
                    amount: vendorDeliveryShare,
                    description: `Delivery fee received - Order ${order.orderId}`,
                    orderId: order._id,
                    transactionType: 'delivery_fee',
                });
            }
        }
    }

    // ── Service fee: credit to admin wallet ────────────────────────────────
    // The service fee was already collected from the customer in the order total.
    // Record it as a distinct revenue line in the admin wallet for clean reporting.
    const orderServiceFee = Number(order.serviceFee || 0);
    if (adminWallet && orderServiceFee > 0) {
        adminWallet.balance = Number((adminWallet.balance + orderServiceFee).toFixed(2));
        adminWallet.transactions.push({
            type: "credit",
            amount: orderServiceFee,
            description: `Service fee collected for Order ${order.orderId}`,
            orderId: order._id,
            transactionType: 'service_fee',
        });
        console.log(`💳 Service fee ₦${orderServiceFee} credited to admin wallet for Order ${order.orderId}`);
    }

    if (adminWallet) await adminWallet.save({ session });

    console.log(`✅ VendorOrders and wallets updated for Order ${order.orderId}`);
    return vendorOrderMapping;
};

/**
 * ========================================
 * HELPER: Release Escrow to Vendor
 * ========================================
 * Called when order reaches delivered or completed status.
 * Transfers the escrowed food revenue from admin wallet to vendor wallet.
 * Idempotent — safe to call multiple times (escrowReleased flag prevents double-pay).
 */
export const releaseEscrowToVendor = async (vendorOrderId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const vendorOrder = await VendorOrder.findById(vendorOrderId).session(session);
        if (!vendorOrder) throw new Error(`VendorOrder ${vendorOrderId} not found`);

        // Idempotency guard — never release twice
        if (vendorOrder.escrowReleased) {
            console.log(`⚡ Escrow already released for VendorOrder ${vendorOrderId}`);
            await session.abortTransaction();
            session.endSession();
            return;
        }

        const escrowAmount = vendorOrder.escrowAmount || 0;
        if (escrowAmount <= 0) {
            console.log(`⚠️ No escrow to release for VendorOrder ${vendorOrderId}`);
            vendorOrder.escrowReleased = true;
            await vendorOrder.save({ session });
            await session.commitTransaction();
            session.endSession();
            return;
        }

        const vendorId = vendorOrder.restaurantId;

        // 1. Debit admin wallet
        const adminWallet = await Wallet.findOne({ ownerModel: "Admin" }).session(session);
        if (!adminWallet) throw new Error("Admin wallet not found");
        if (adminWallet.balance < escrowAmount) {
            throw new Error(`Admin wallet insufficient for escrow release: has ₦${adminWallet.balance}, needs ₦${escrowAmount}`);
        }

        adminWallet.balance = Number((adminWallet.balance - escrowAmount).toFixed(2));
        adminWallet.transactions.push({
            type: "debit",
            amount: escrowAmount,
            description: `Escrow release to vendor for VendorOrder ${vendorOrderId}`,
            orderId: vendorOrder.userOrderId,
            transactionType: 'escrow_release',
        });
        await adminWallet.save({ session });

        // 2. Credit vendor wallet
        let vendorWallet = await Wallet.findOne({
            ownerId: vendorId,
            ownerModel: "Vendor"
        }).session(session);

        if (!vendorWallet) {
            [vendorWallet] = await Wallet.create(
                [{ ownerId: vendorId, ownerModel: "Vendor", balance: 0 }],
                { session }
            );
        }

        vendorWallet.balance = Number((vendorWallet.balance + escrowAmount).toFixed(2));
        vendorWallet.totalEarned = Number((vendorWallet.totalEarned + escrowAmount).toFixed(2));
        vendorWallet.transactions.push({
            type: "credit",
            amount: escrowAmount,
            description: `Food revenue released from escrow for VendorOrder ${vendorOrderId}`,
            orderId: vendorOrder.userOrderId,
            transactionType: 'escrow_release',
        });
        await vendorWallet.save({ session });

        // 3. Mark escrow as released
        vendorOrder.escrowReleased = true;
        await vendorOrder.save({ session });

        await session.commitTransaction();
        session.endSession();

        console.log(`✅ Escrow released: ₦${escrowAmount} → Vendor ${vendorId} for VendorOrder ${vendorOrderId}`);

    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        session.endSession();
        console.error(`❌ releaseEscrowToVendor failed for ${vendorOrderId}:`, error.message);
        throw error;
    }
};

/**
 * ========================================
 * UPDATE ORDER AFTER PAYMENT VERIFICATION
 * ========================================
 * Updates an existing pending order after payment is verified
 * This is the NEW correct flow: Order exists first, then gets updated
 */
export const updateOrderAfterPayment = async (orderId, paymentReference) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        /* ============================================
         * ATOMIC STATUS TRANSITION
         * findOneAndUpdate with a condition ensures only
         * ONE concurrent call can transition from pending
         * to paid. If the condition doesn't match (because
         * another request already paid it), returns null.
         * ============================================ */
        const order = await Order.findOneAndUpdate(
            {
                $or: [
                    { _id: orderId },
                    { orderId: orderId },
                    { paymentReference: paymentReference }
                ],
                // Only update if STILL in a non-terminal state
                // Prevents double-crediting if two callers
                // somehow both reach this point
                paymentStatus: { $nin: ["paid", "failed", "refunded"] },
            },
            {
                $set: {
                    paymentStatus: "paid",
                    orderStatus:   "accepted",
                },
            },
            {
                new:     true,   // return the updated document
                session,
            }
        );

        if (!order) {
            // Atomic update returned null — another request
            // already transitioned this order. Clean exit.
            await session.commitTransaction();
            session.endSession();
            console.log(
                `⚡ Atomic idempotency: order ${orderId} already processed`
            );
            const current = await Order.findOne({
                $or: [
                    { _id: orderId },
                    { orderId: orderId },
                    { paymentReference: paymentReference }
                ]
            });
            return current;
        }

        // 4. Create VendorOrders and update wallets
        const vendorOrderMapping = await createVendorOrdersAndUpdateWallets(order, session);
        await generateOrderInvoice(order, { session });

        await recordPaymentAttemptEvent({
            reference: paymentReference || order.paymentReference,
            order,
            status: "recovered",
            recoveryState: "fulfilled",
            type: "order_fulfillment_created",
            message: "Order marked paid and vendor fulfillment created",
            metadata: {
                vendorOrderIds: Object.values(vendorOrderMapping).map((id) => String(id)),
            },
            session,
        });

        // 🎁 Claim free delivery slot (Paystack-paid orders)
        // Non-fatal — payment confirmation proceeds regardless of promo outcome
        if (order.freeDeliveryPromo?.eligible && !order.freeDeliveryPromo?.claimed) {
            try {
                await claimFreeDeliverySlotInSession(order, session);
            } catch (promoErr) {
                logger.error(
                    { orderId: order.orderId, error: promoErr.message },
                    "❌ Free delivery claim failed post-payment — manual review required"
                );
                // Non-fatal: do not abort the transaction or block payment confirmation
            }
        }

        // 🏪 Record vendor promo usage (Paystack-paid orders)
        if (order.vendorDeliveryPromo?.applied) {
            try {
                await recordVendorPromoUsage(order, session);
            } catch (promoErr) {
                logger.error(
                    { orderId: order.orderId, error: promoErr.message },
                    "❌ Vendor promo usage recording failed — manual review required"
                );
                // Non-fatal: do not abort payment confirmation
            }
        }

        await session.commitTransaction();
        session.endSession();

        console.log(`✅ Order ${order.orderId} updated to paid`);

        // Queue vendor auto-cancellation checks after payment confirmation
        // The worker checks each VendorOrder status before cancelling.
        try {
            await queueVendorOrderAutoCancelChecks(order, vendorOrderMapping);
            logger.info({ orderId: order.orderId }, 'Vendor auto-cancel checks queued');
        } catch (queueErr) {
            // Non-fatal — log but don't block order confirmation
            logger.error({ orderId: order.orderId, error: queueErr.message }, '⚠️ Failed to queue auto-cancel job');
        }

        // 🔔 Send notifications AFTER transaction commits
        try {
            const { sendOrderNotification } = await import('../../services/notification.service.js');
            const Vendor = (await import('../../model/vendor/vendor.model.js')).default;

            const restaurantIds = [...new Set(order.items.map(item => String(item.restaurantId)))];
            const vendorsForNotif = await Vendor.find({ _id: { $in: restaurantIds } }).select('storeName');
            const restaurantNames = vendorsForNotif.map(v => v.storeName).join(', ');

            // 1. Notify Customer
            await sendOrderNotification(order.userId, order.orderId, 'accepted', {
                orderDatabaseId: order._id,
                restaurantName: restaurantNames,
                totalAmount: order.total
            });

            // 2. Notify Vendors
            // Vendor notifications are emitted after this block so customer failures cannot suppress them.

            console.log(`Customer notification sent for verified order ${order.orderId}`);
        } catch (notifError) {
            console.error('❌ Failed to send notifications after payment:', notifError.message);
        }

        await notifyPaidOrderVendors({
            order,
            restaurantIds: [...new Set(order.items.map(item => String(item.restaurantId)))],
            vendorOrderMapping,
            items: order.items,
            totalAmount: order.total
        });

        return order;

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        console.error("updateOrderAfterPayment failed:", error.message);
        throw error;
    }
};

/**
 * ========================================
 * CONTROLLER: Create Order Endpoint
 * ========================================
 */
export const createOrderController = async (req, res) => {
    let order = null;
    let reference = null;
    try {
        const { items, vendorDeliveryFees, deliveryAddress, phone, discountCode, useWallet, idempotencyKey, deviceId } = req.body;
        const clientIp = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "unknown";
        const userId = req.userId; // From auth middleware

        if (usePostgresOrderWrites()) {
            if (useWallet) {
                return res.status(400).json({
                    success: false,
                    message: "Postgres wallet order creation is blocked until wallet debit writes are migrated.",
                });
            }
            if (discountCode) {
                return res.status(400).json({
                    success: false,
                    message: "Postgres discount order creation is blocked until discount usage writes are migrated.",
                });
            }

            const result = await postgresOrderCreationRepository.createPendingOrder({
                userId,
                items,
                vendorDeliveryFees,
                deliveryAddress,
                phone,
                idempotencyKey: idempotencyKey || null,
            });

            if (!usePostgresPaymentWrites()) {
                return res.status(result.idempotent ? 200 : 201).json({
                    success: true,
                    message: "Order created in Postgres. Online payment initialization is intentionally disabled until DB_PAYMENT_WRITE_PROVIDER=postgres.",
                    order: result.order,
                    payment: {
                        provider: "none",
                        status: "not_initialized",
                        reason: "payment_writes_not_enabled",
                    },
                });
            }

            reference = `PSK_${result.order.orderId}_${Date.now()}`;
            await postgresPaymentRepository.initializeOrderPaymentReference({
                orderId: result.order.id,
                reference,
                cartSnapshot: {
                    items,
                    vendorDeliveryFees,
                    deliveryAddress,
                    phone,
                    discountCode,
                    useWallet,
                    idempotencyKey,
                    deviceId: deviceId || req.headers["x-melachow-device-id"] || null,
                },
            });

            const userEmail = req.user?.email || req.body.email;
            if (!userEmail) throw new Error("Email required for payment initialization");

            let paystackResponse;
            try {
                paystackResponse = await axios.post(
                    "https://api.paystack.co/transaction/initialize",
                    {
                        email: userEmail,
                        amount: Math.round(Number(result.order.total || 0)),
                        reference,
                        callback_url: process.env.CALL_BACK_URL,
                        metadata: {
                            orderId: result.order.orderId,
                            postgresOrderId: result.order.id,
                            userId: String(userId),
                            moneyUnit: "kobo",
                        }
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                            "Content-Type": "application/json"
                        }
                    }
                );
            } catch (paystackError) {
                await postgresPaymentRepository.recordInitializationFailed({
                    reference,
                    message: paystackError.response?.data?.message || paystackError.message || "Payment initialization failed",
                    metadata: {
                        providerError: paystackError.response?.data || null,
                    },
                }).catch((auditError) => logger.warn({ error: auditError.message }, "Failed to record Postgres payment initialization failure"));
                throw paystackError;
            }

            const data = paystackResponse.data?.data;
            await postgresPaymentRepository.recordProviderInitialized({
                reference: data.reference || reference,
                authorizationUrl: data.authorization_url,
                accessCode: data.access_code,
                providerPayload: data,
            });

            return res.status(result.idempotent ? 200 : 201).json({
                success: true,
                message: "Order created successfully. Proceed to payment.",
                authorization_url: data.authorization_url,
                reference: data.reference,
                order: {
                    ...result.order,
                    paymentReference: data.reference || reference,
                }
            });
        }

        order = await createOrderV2({
            userId,
            items,
            vendorDeliveryFees,
            deliveryAddress,
            phone,
            discountCode,
            useWallet, // Pass wallet flag
            paymentStatus: "pending", // Will be updated if wallet used
            idempotencyKey: idempotencyKey || null, // ← PASS THROUGH
            clientIp: clientIp,
            deviceId: deviceId || req.headers["x-melachow-device-id"] || null,
        });

        // If paid via wallet, it's already fulfilled atomically in createOrderV2
        if (order.paymentStatus === "paid") {
            return res.status(201).json({
                success: true,
                message: "Order created and paid successfully",
                order: order
            });
        }



        // 🔄 PAYSTACK FLOW (Default)
        // If not paid by wallet, initialize Paystack
        reference = `PSK_${order.orderId}_${Date.now()}`;
        order.paymentReference = reference;
        await order.save();

        await recordPaymentAttemptEvent({
            reference,
            order,
            status: "initialized",
            recoveryState: "awaiting_verification",
            type: "payment_initialized",
            message: "Payment reference created before Paystack redirect",
            cartSnapshot: {
                items,
                vendorDeliveryFees,
                deliveryAddress,
                phone,
                discountCode,
                useWallet,
                idempotencyKey,
                deviceId: deviceId || req.headers["x-melachow-device-id"] || null,
            },
        });

        const userEmail = req.user?.email || req.body.email;
        if (!userEmail) throw new Error("Email required for payment initialization");

        // Initialize Paystack
        const paystackResponse = await axios.post(
            "https://api.paystack.co/transaction/initialize",
            {
                email: userEmail,
                amount: Math.round(order.total * 100),
                reference,
                callback_url: process.env.CALL_BACK_URL,
                metadata: {
                    orderId: order.orderId,
                    userId: String(userId)
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const data = paystackResponse.data?.data;

        await recordPaymentAttemptEvent({
            reference: data.reference || reference,
            order,
            status: "pending",
            recoveryState: "awaiting_verification",
            type: "payment_provider_initialized",
            message: "Paystack authorization URL generated",
            authorizationUrl: data.authorization_url,
            accessCode: data.access_code,
        });

        return res.status(201).json({
            success: true,
            message: "Order created successfully. Proceed to payment.",
            authorization_url: data.authorization_url,
            reference: data.reference,
            order
        });

    } catch (error) {
        if (reference && order?._id) {
            await recordPaymentAttemptEvent({
                reference,
                order,
                status: "failed",
                recoveryState: "review",
                type: "payment_initialization_failed",
                message: error.response?.data?.message || error.message || "Payment initialization failed",
                metadata: {
                    providerError: error.response?.data || null,
                },
            }).catch((auditError) => logger.warn({ error: auditError.message }, "Failed to record payment initialization failure"));
        }

        if (order?._id && order.paymentStatus !== "paid") {
            await releasePromoReservationsForOrder(order._id);
        }

        console.error("Create Order Controller Error:", error);
        return res.status(400).json({
            success: false,
            message: error.response?.data?.message || error.message || "Failed to create order"
        });
    }
};

