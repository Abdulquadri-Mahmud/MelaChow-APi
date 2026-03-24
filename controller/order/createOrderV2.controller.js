import mongoose from "mongoose";
import axios from "axios";
import crypto from "crypto";
import Order from "../../model/order/Order.js";
import VendorOrder from "../../model/vendor/VendorOrder.js";
import MenuItem         from "../../model/menu/MenuItem.js";
import MenuItemPortion  from "../../model/menu/MenuItemPortion.js";
import { MenuItemChoiceGroup, MenuItemChoiceOption }
  from "../../model/menu/MenuItemChoice.js";
import {
  MenuVariant,
  VariantChoiceGroup,
  VariantChoiceOption,
} from "../../model/menu/MenuVariant.js";
import City from "../../model/location/City.js";
import Vendor from "../../model/vendor/vendor.model.js";

import Wallet from "../../model/wallet/wallet.mode.js";
import Admin from "../../model/Admin/admin.model.js";
import discountService from "../../services/discount.service.js";
import Discount from "../../model/discount/Discount.js";
import { emitNewOrderToRestaurant } from "../../socket/events/orderEvents.js";
import { orderAutoCancelQueue } from '../../config/queue.js';
import logger from '../../config/logger.js';

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
 * HELPER: Validate Combo (MenuVariant)
 * ========================================
 */
const validateCombo = async (cartItem) => {
  const combo = await MenuVariant.findOne({
    _id:          cartItem.variantId,
    is_available: true,
    is_archived:  { $ne: true },
  }).lean();

  if (!combo) {
    throw new Error(`Combo not found or unavailable`);
  }

  // Validate selected_swaps
  const normalizedSwaps = [];
  const selectedSwaps   = cartItem.selected_swaps || [];

  if (selectedSwaps.length > 0) {
    const swapGroups = await VariantChoiceGroup.find({
      variant_id: combo._id,
    }).lean();

    const swapGroupIds = swapGroups.map(g => g._id);
    const swapOptions  = await VariantChoiceOption.find({
      group_id: { $in: swapGroupIds },
    }).lean();

    const swapOptionMap = {};
    swapOptions.forEach(o => {
      swapOptionMap[o._id.toString()] = o;
    });

    for (const sel of selectedSwaps) {
      const option = swapOptionMap[sel.option_id?.toString()];
      if (!option) {
        throw new Error(
          `Combo swap: Invalid option "${sel.label}"`
        );
      }
      normalizedSwaps.push({
        group_id:             sel.group_id,
        option_id:            option._id,
        label:                option.label,
        price_modifier_naira: Math.round(
          (option.price_modifier || 0) / 100
        ),
      });
    }

    // Check required swap groups
    for (const group of swapGroups) {
      if (!group.is_required) continue;
      const hasSelection = normalizedSwaps.some(
        s => s.group_id?.toString() === group._id.toString()
      );
      if (!hasSelection) {
        throw new Error(
          `Combo: "${group.name}" swap is required`
        );
      }
    }
  }

  // Normalize component_choices
  const normalizedComponentChoices =
    (cartItem.component_choices || []).map(cc => ({
      componentId:          cc.componentId,
      groupId:              cc.groupId,
      optionId:             cc.optionId,
      label:                cc.label,
      price_modifier_naira: cc.price_modifier_naira || 0,
    }));

  // Price: MenuVariant.price is in KOBO — convert to naira
  const basePrice          = combo.price / 100;
  const swapsTotal         = normalizedSwaps.reduce(
    (sum, s) => sum + (s.price_modifier_naira || 0), 0
  );
  const componentChoicesTotal = normalizedComponentChoices.reduce(
    (sum, c) => sum + (c.price_modifier_naira || 0), 0
  );
  const unitPrice = basePrice + swapsTotal + componentChoicesTotal;

  return {
    combo,
    unitPrice,
    normalizedSwaps,
    normalizedComponentChoices,
  };
};


/**
 * Resolve the correct delivery fee for a vendor.
 * Mirrors resolveStorefrontDeliveryFee in customerMenuController.
 * Returns fee in NAIRA.
 *
 * Priority:
 * 1. vendor.deliveryManagedBy === "vendor" → flatRateDeliveryFee
 * 2. platformDeliveryFeeOverride set → use override
 * 3. Fall back to City.platformDeliveryFee
 */
const resolveVendorDeliveryFee = async (vendor) => {
  if (vendor.deliveryManagedBy === "vendor") {
    return vendor.flatRateDeliveryFee ?? 0;
  }

  if (
    vendor.platformDeliveryFeeOverride != null &&
    vendor.platformDeliveryFeeOverride > 0
  ) {
    return vendor.platformDeliveryFeeOverride;
  }

  try {
    const cityName = vendor.address?.city;
    if (!cityName) return 0;

    const city = await City.findOne({
      name: { $regex: new RegExp(`^${cityName}$`, "i") },
    }).lean();

    return city?.platformDeliveryFee ?? 0;
  } catch {
    return 0;
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
            (!cartItem.type && cartItem.variantId && !cartItem.foodId);

          let normalizedItem;

          if (isCombo) {
            // ── COMBO ITEM ────────────────────────────────
            if (!cartItem.variantId) {
              throw new Error(`Item ${i}: variantId required for combo`);
            }

            const {
              combo,
              unitPrice,
              normalizedSwaps,
              normalizedComponentChoices,
            } = await validateCombo(cartItem);

            normalizedItem = {
              type:         "combo",
              variantId:    combo._id,
              foodId:       null,
              portionId:    null,

              // ── New explicit fields ──
              portion_label:    "",
              portion_quantity: 1,
              dietary_type:     "",
              item_type:        "combo",
              storeName:        cartItem.storeName || "",

              // selected_options empty for combos — swaps live in metadata
              selected_options: [],

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

              // ── metadata retained for backward compatibility ──
              metadata: {
                type:              "combo",
                selected_swaps:    normalizedSwaps,
                component_choices: normalizedComponentChoices,
                pricing: {
                  base_naira:        combo.price / 100,
                  swaps_total_naira: normalizedSwaps.reduce(
                    (s, sw) => s + sw.price_modifier_naira, 0
                  ),
                  final_unit_naira:  unitPrice,
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

        // Bulk fetch all unique vendors in this order
        const uniqueVendorIds = Object.keys(vendorItemsMap);

        const vendorsForFees = await Vendor.find({
          _id: { $in: uniqueVendorIds },
        }).select(
          "storeName deliveryManagedBy flatRateDeliveryFee " +
          "platformDeliveryFeeOverride address"
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

        // --- 6️⃣ DISCOUNT LOGIC ---
        let finalTotal = Number((subtotal + totalDeliveryFee).toFixed(2));
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
                items: normalizedItems
            });

            if (!validation.valid) {
                throw new Error(`Discount Error: ${validation.error}`);
            }

            // Calculate
            const calculation = discountService.calculateFinalPrice(
                { subtotal, deliveryFee: totalDeliveryFee, items: normalizedItems },
                validation.discount
            );

            finalTotal = calculation.total;
            appliedDiscount = calculation.appliedDiscount;

            // Increment discount usage
            await Discount.updateOne(
                { code: validation.discount.code },
                { $inc: { usageCount: 1 } }
            ).session(session);
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
                        total,
                        appliedDiscount, // Persist discount snapshot
                        paymentReference: finalPaymentRef,
                        paymentStatus: finalPaymentStatus, // "paid" if wallet used
                        orderStatus: "pending"
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
        let vendorOrderMapping = {};
        if (useWallet) {
            vendorOrderMapping = await createVendorOrdersAndUpdateWallets(order, session);
        }

        await session.commitTransaction();
        session.endSession();

        console.log(`✅ Order created successfully: ${finalOrderId} (status: pending)`);

        // 🔔 Send notifications AFTER transaction commits
        try {
            const { sendOrderNotification, sendVendorNotification } = await import('../../services/notification.service.js');

            // 1. Notify Customer
            // Get restaurant names for the notification
            const restaurantIds = [...new Set(normalizedItems.map(item => String(item.restaurantId)))];
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

            // 2. Notify Vendors (only if paid/accepted)
            if (order.paymentStatus === 'paid') {
                for (const restaurantId of restaurantIds) {
                    const vendorOrderId = vendorOrderMapping[restaurantId];
                    // Send persistent notification
                    await sendVendorNotification(restaurantId, finalOrderId, 'vendor_new_order', {
                        orderDatabaseId: vendorOrderId || order._id,
                        customerName: order.deliveryAddress?.name || 'A customer',
                        location: order.deliveryAddress?.addressLine || 'specified location',
                        totalAmount: total,
                        items: normalizedItems.filter(i => String(i.restaurantId) === String(restaurantId))
                    });

                    // Emit real-time order event for dashboard
                    emitNewOrderToRestaurant({
                        ...order.toObject(),
                        restaurantId // Specify which restaurant this broadcast is for
                    });
                }
            }

            console.log(`✅ Notifications sent for order ${finalOrderId}`);
        } catch (notifError) {
            console.error('❌ Failed to send notifications:', notifError.message);
            // Don't throw - notification failure shouldn't block order creation
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
    const PLATFORM_COMMISSION = 0.1; // 10%

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

        const vendor = await Vendor.findById(vendorId).session(session);
        const deliveryManagedBy = vendor?.deliveryManagedBy || "admin";

        // Only credit delivery fee to vendor if THEY manage delivery.
        // If platform manages delivery, delivery fee goes to admin
        // wallet and vendor deliveryShare on their order is 0.
        const vendorOwnDelivery = deliveryManagedBy === "vendor";

        // ── ESCROW: Hold vendor food revenue in admin wallet until delivery ──
        // vendorTotal = vendor's food share (subtotal minus commission)
        // This moves to vendor wallet only after order is delivered/completed.
        // deliveryShare for vendor-managed delivery is also escrowed.
        const escrowAmount = vendorOwnDelivery
            ? Number((vendorTotal + vendorDeliveryShare).toFixed(2))
            : Number(vendorTotal.toFixed(2));

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
                      vendorEarning: Number(
                        (item.price * (1 - PLATFORM_COMMISSION)).toFixed(2)
                      ),

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
                    // deliveryShare only shown on vendor's order if
                    // THEY handle delivery — otherwise 0 (platform keeps it)
                    deliveryShare: vendorOwnDelivery ? vendorDeliveryShare : 0,
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
            adminWallet.balance = Number((adminWallet.balance + escrowAmount).toFixed(2));
            adminWallet.transactions.push({
                type: "credit",
                amount: escrowAmount,
                description: `Escrow: vendor food revenue held for Order ${order.orderId}`,
                orderId: order._id,
                transactionType: 'escrow_hold',
            });

            // Platform-managed delivery fee also held in admin wallet
            if (!vendorOwnDelivery && vendorDeliveryShare > 0) {
                adminWallet.balance = Number((adminWallet.balance + vendorDeliveryShare).toFixed(2));
                adminWallet.transactions.push({
                    type: "credit",
                    amount: vendorDeliveryShare,
                    description: `Delivery fee held for admin rider - Order ${order.orderId}`,
                    orderId: order._id,
                    transactionType: 'delivery_fee',
                });
            }
        }
    }

    // Update admin wallet (lines 693-725)
    const totalCommission = vendorIds.reduce((sum, vendorId) => {
        const vendorSubtotal = vendorItemsMap[vendorId].reduce(
            (s, item) => s + item.price * item.quantity,
            0
        );
        return sum + vendorSubtotal * PLATFORM_COMMISSION;
    }, 0);

    // Link admin wallet for commission (fetch already done above)

    if (adminWallet) {
        adminWallet.balance = Number(
            (adminWallet.balance + totalCommission).toFixed(2)
        );
        adminWallet.transactions.push({
            type: "credit",
            amount: Number(totalCommission.toFixed(2)),
            description: `Commission from Order ${order.orderId}`,
            orderId: order._id,
            transactionType: 'commission',
        });
        await adminWallet.save({ session });
    }

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

        await session.commitTransaction();
        session.endSession();

        console.log(`✅ Order ${order.orderId} updated to paid`);

        // Queue auto-cancellation check — fires in 15 minutes if vendor hasn't responded
        // The worker checks current order status before cancelling — safe if vendor accepts in time
        try {
            const vendorOrderIds = Object.values(vendorOrderMapping);
            for (const vendorOrderId of vendorOrderIds) {
                await orderAutoCancelQueue.add(
                    'check-pending',
                    {
                        orderId: order._id.toString(),
                        vendorOrderId: vendorOrderId.toString(),
                    },
                    {
                        delay: 15 * 60 * 1000,             // 15 minutes
                        jobId: `auto-cancel-${order._id}`,  // Idempotent — one job per order
                    }
                );
            }
            logger.info({ orderId: order.orderId }, '⏰ Auto-cancel job queued (15 min)');
        } catch (queueErr) {
            // Non-fatal — log but don't block order confirmation
            logger.error({ orderId: order.orderId, error: queueErr.message }, '⚠️ Failed to queue auto-cancel job');
        }

        // 🔔 Send notifications AFTER transaction commits
        try {
            const { sendOrderNotification, sendVendorNotification } = await import('../../services/notification.service.js');
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
            for (const restaurantId of restaurantIds) {
                const vendorOrderId = vendorOrderMapping[restaurantId];
                // Persistent notification
                await sendVendorNotification(restaurantId, order.orderId, 'vendor_new_order', {
                    orderDatabaseId: vendorOrderId || order._id,
                    customerName: order.deliveryAddress?.name || 'A customer',
                    location: order.deliveryAddress?.addressLine || 'specified location',
                    totalAmount: order.total,
                    items: order.items.filter(i => String(i.restaurantId) === String(restaurantId))
                });

                // Real-time dashboard event
                emitNewOrderToRestaurant({
                    ...order.toObject(),
                    restaurantId
                });
            }

            console.log(`✅ Real-time notifications sent for verified order ${order.orderId}`);
        } catch (notifError) {
            console.error('❌ Failed to send notifications after payment:', notifError.message);
        }

        return order;

    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        session.endSession();
        console.error("❌ updateOrderAfterPayment failed:", error.message);
        throw error;
    }
};

/**
 * ========================================
 * CONTROLLER: Create Order Endpoint
 * ========================================
 */
export const createOrderController = async (req, res) => {
    try {
        const { items, vendorDeliveryFees, deliveryAddress, phone, discountCode, useWallet, idempotencyKey } = req.body;
        const userId = req.userId; // From auth middleware

        const order = await createOrderV2({
            userId,
            items,
            vendorDeliveryFees,
            deliveryAddress,
            phone,
            discountCode,
            useWallet, // Pass wallet flag
            paymentStatus: "pending", // Will be updated if wallet used
            idempotencyKey: idempotencyKey || null, // ← PASS THROUGH
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
        const reference = `PSK_${order.orderId}_${Date.now()}`;
        order.paymentReference = reference;
        await order.save();

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

        return res.status(201).json({
            success: true,
            message: "Order created successfully. Proceed to payment.",
            authorization_url: data.authorization_url,
            reference: data.reference,
            order
        });

    } catch (error) {
        console.error("Create Order Controller Error:", error);
        return res.status(400).json({
            success: false,
            message: error.response?.data?.message || error.message || "Failed to create order"
        });
    }
};