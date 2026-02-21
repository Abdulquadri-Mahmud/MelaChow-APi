import mongoose from "mongoose";
import axios from "axios";
import crypto from "crypto";
import Order from "../../model/order/Order.js";
import VendorOrder from "../../model/vendor/VendorOrder.js";
import Food from "../../model/vendor/food.model.js";
import Vendor from "../../model/vendor/vendor.model.js";
import Wallet from "../../model/wallet/wallet.mode.js";
import Admin from "../../model/Admin/admin.model.js";
import discountService from "../../services/discount.service.js";
import Discount from "../../model/discount/Discount.js";
import { emitNewOrderToRestaurant } from "../../socket/events/orderEvents.js";

/**
 * ========================================
 * HELPER: Validate Choice Groups
 * ========================================
 */
const validateChoiceGroups = (food, selectedChoices) => {
    if (!food.choiceGroups || food.choiceGroups.length === 0) {
        // No choice groups defined, so no validation needed
        return [];
    }

    const validatedChoices = [];

    for (const group of food.choiceGroups) {
        // Find selections for this group from metadata
        const groupSelections = selectedChoices.filter(c => c.group === group.name);

        // Check min/max constraints
        if (groupSelections.length < group.minSelect) {
            throw new Error(
                `${food.name}: "${group.name}" requires at least ${group.minSelect} selection(s)`
            );
        }

        // Validate each choice exists and get price
        for (const selection of groupSelections) {
            const option = group.options.find(o => o.name === selection.name);

            if (!option) {
                throw new Error(
                    `${food.name}: Invalid choice "${selection.name}" in group "${group.name}"`
                );
            }

            // Check stock
            if (option.stock !== Infinity && option.stock < 1) {
                throw new Error(
                    `${food.name}: Choice "${option.name}" is out of stock`
                );
            }

            validatedChoices.push({
                group: group.name,
                name: option.name,
                price: option.price || 0,
                image: option.image || ""
            });
        }
    }

    return validatedChoices;
};

/**
 * ========================================
 * HELPER: Validate Variant/Portion
 * ========================================
 */
const validateVariant = (food, variantData) => {
    if (!variantData || !variantData.name) {
        // No variant selected, use base food price
        return {
            name: "Standard",
            price: food.price,
            image: food.images?.[0]?.url || ""
        };
    }

    // Check in variants array
    const variant = food.variants?.find(v => v.name === variantData.name);
    if (variant) {
        // Check stock
        if (variant.stock !== Infinity && variant.stock < 1) {
            throw new Error(`${food.name}: Variant "${variant.name}" is out of stock`);
        }

        return {
            name: variant.name,
            price: variant.price,
            image: variant.image || food.images?.[0]?.url || ""
        };
    }

    // Check in portions array
    const portion = food.portions?.find(p => p.label === variantData.name);
    if (portion) {
        return {
            name: portion.label,
            price: portion.price,
            image: food.images?.[0]?.url || ""
        };
    }

    throw new Error(`${food.name}: Invalid variant/portion "${variantData.name}"`);
};

/**
 * ========================================
 * HELPER: Validate Availability
 * ========================================
 */
const validateAvailability = (food) => {
    // Check if food is available
    if (!food.available) {
        throw new Error(`${food.name} is currently unavailable`);
    }

    // Check availability schedule
    if (food.availabilitySchedule?.enabled) {
        const now = new Date();
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const currentDay = days[now.getDay()];
        const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"

        if (!food.availabilitySchedule.days.includes(currentDay)) {
            throw new Error(`${food.name} is not available on ${currentDay}`);
        }

        if (
            currentTime < food.availabilitySchedule.startTime ||
            currentTime > food.availabilitySchedule.endTime
        ) {
            throw new Error(
                `${food.name} is only available between ${food.availabilitySchedule.startTime} - ${food.availabilitySchedule.endTime}`
            );
        }
    }
};

/**
 * ========================================
 * HELPER: Calculate Item Price
 * ========================================
 */
const calculateItemPrice = (food, variant, choices, quantity) => {
    // 1. Base price from variant
    let basePrice = variant.price;

    // 2. Add choice prices
    const choicesTotal = choices.reduce((sum, choice) => sum + (choice.price || 0), 0);

    // 3. Add packaging fee
    const packagingFee = food.packagingFee || 0;

    // 4. Calculate subtotal before discount
    let unitPrice = basePrice + choicesTotal + packagingFee;

    // 5. Apply discount if active
    let discountAmount = 0;
    if (food.discount?.active) {
        // Check if discount is not expired
        if (!food.discount.expiresAt || new Date(food.discount.expiresAt) > new Date()) {
            if (food.discount.percentage > 0) {
                discountAmount = (unitPrice * food.discount.percentage) / 100;
            } else if (food.discount.flatAmount > 0) {
                discountAmount = food.discount.flatAmount;
            }
        }
    }

    const finalUnitPrice = Math.max(0, unitPrice - discountAmount);

    return {
        unitPrice: Number(finalUnitPrice.toFixed(2)),
        totalPrice: Number((finalUnitPrice * quantity).toFixed(2)),
        breakdown: {
            basePrice,
            choicesTotal,
            packagingFee,
            discountAmount: Number(discountAmount.toFixed(2)),
            subtotalBeforeDiscount: Number(unitPrice.toFixed(2))
        }
    };
};

/**
 * ========================================
 * HELPER: Decrement Stock
 * ========================================
 */
const decrementStock = async (food, variant, choices, quantity, session) => {
    // 1. Decrement food stock
    if (food.stock !== Infinity) {
        food.stock -= quantity;
        if (food.stock < 0) food.stock = 0;
    }

    // 2. Increment order count
    food.orderCount = (food.orderCount || 0) + 1;

    // 3. Decrement variant stock
    if (variant.name !== "Standard") {
        const variantIndex = food.variants?.findIndex(v => v.name === variant.name);
        if (variantIndex !== -1 && food.variants[variantIndex].stock !== Infinity) {
            food.variants[variantIndex].stock -= quantity;
            if (food.variants[variantIndex].stock < 0) {
                food.variants[variantIndex].stock = 0;
            }
        }
    }

    // 4. Decrement choice options stock
    for (const choice of choices) {
        const groupIndex = food.choiceGroups?.findIndex(g => g.name === choice.group);
        if (groupIndex !== -1) {
            const optionIndex = food.choiceGroups[groupIndex].options.findIndex(
                o => o.name === choice.name
            );
            if (
                optionIndex !== -1 &&
                food.choiceGroups[groupIndex].options[optionIndex].stock !== Infinity
            ) {
                food.choiceGroups[groupIndex].options[optionIndex].stock -= quantity;
                if (food.choiceGroups[groupIndex].options[optionIndex].stock < 0) {
                    food.choiceGroups[groupIndex].options[optionIndex].stock = 0;
                }
            }
        }
    }

    await food.save({ session });
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
    orderId = null
}) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
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
         * 2️⃣ FETCH ALL FOODS
         * ======================================== */
        const foodIds = items.map(item => item.foodId);
        const foods = await Food.find({ _id: { $in: foodIds } }).session(session);

        if (foods.length !== foodIds.length) {
            throw new Error("One or more food items not found");
        }

        const foodMap = {};
        foods.forEach(food => {
            foodMap[String(food._id)] = food;
        });

        /* ========================================
         * 3️⃣ VALIDATE & NORMALIZE ITEMS
         * ======================================== */
        const normalizedItems = [];
        const vendorItemsMap = {}; // Group items by vendor for VendorOrder creation

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            // Basic validation
            if (!item.foodId) throw new Error(`Item ${i}: foodId is required`);
            if (!item.restaurantId) throw new Error(`Item ${i}: restaurantId is required`);
            if (!item.quantity || item.quantity < 1) {
                throw new Error(`Item ${i}: quantity must be at least 1`);
            }

            const food = foodMap[String(item.foodId)];
            if (!food) throw new Error(`Item ${i}: Food not found`);

            // Validate vendor ownership
            if (String(food.vendor) !== String(item.restaurantId)) {
                throw new Error(`Item ${i}: Food does not belong to specified restaurant`);
            }

            // Validate availability
            validateAvailability(food);

            // Validate and get variant/portion
            const validatedVariant = validateVariant(food, item.variant);

            // Validate and get choices
            const selectedChoices = item.metadata?.choices || [];
            const validatedChoices = validateChoiceGroups(food, selectedChoices);

            // Calculate price (server-side, ignoring frontend prices)
            const pricing = calculateItemPrice(
                food,
                validatedVariant,
                validatedChoices,
                item.quantity
            );

            // Decrement stock
            await decrementStock(
                food,
                validatedVariant,
                validatedChoices,
                item.quantity,
                session
            );

            // Build normalized item
            const normalizedItem = {
                foodId: food._id,
                restaurantId: item.restaurantId,
                variant: {
                    name: validatedVariant.name,
                    price: pricing.unitPrice,
                    image: validatedVariant.image
                },
                quantity: item.quantity,
                price: pricing.unitPrice,
                note: item.note || "",
                metadata: {
                    ...item.metadata,
                    choices: validatedChoices,
                    pricing: pricing.breakdown
                }
            };

            normalizedItems.push(normalizedItem);

            // Group by vendor for VendorOrder
            const vendorId = String(item.restaurantId);
            if (!vendorItemsMap[vendorId]) {
                vendorItemsMap[vendorId] = [];
            }
            vendorItemsMap[vendorId].push(normalizedItem);
        }

        /* ========================================
         * 4️⃣ CALCULATE TOTALS
         * ======================================== */
        const subtotal = normalizedItems.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
        );

        // Validate delivery fees
        const deliveryFeeMap = {};
        let totalDeliveryFee = 0;

        for (const vendorFee of vendorDeliveryFees) {
            const vendorId = String(vendorFee.restaurantId);
            const fee = Number(vendorFee.deliveryFee);

            if (isNaN(fee) || fee < 0) {
                throw new Error(`Invalid delivery fee for restaurant ${vendorId}`);
            }

            if (deliveryFeeMap[vendorId] !== undefined) {
                throw new Error(`Duplicate delivery fee for restaurant ${vendorId}`);
            }

            deliveryFeeMap[vendorId] = fee;
            totalDeliveryFee += fee;
        }

        // Ensure all vendors have delivery fees
        const vendorIds = Object.keys(vendorItemsMap);
        for (const vendorId of vendorIds) {
            if (deliveryFeeMap[vendorId] === undefined) {
                throw new Error(`Missing delivery fee for restaurant ${vendorId}`);
            }
        }

        // --- DISCOUNT LOGIC ---
        let finalTotal = Number((subtotal + totalDeliveryFee).toFixed(2));
        let appliedDiscount = null;

        if (discountCode) {
            // Determine vendor context (if single vendor order)
            const uniqueVendorIds = [...new Set(normalizedItems.map(i => String(i.restaurantId)))];
            const vendorIdContext = uniqueVendorIds.length === 1 ? uniqueVendorIds[0] : null;

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
         * 5️⃣ WALLET PAYMENT (OPTIONAL)
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
                date: new Date()
            });
            await userWallet.save({ session });

            // Mark as successful payment
            finalPaymentStatus = "paid";
            finalPaymentRef = `WALLET_${finalOrderId}`;
        }

        /* ========================================
         * 6️⃣ CREATE ORDER
         * ======================================== */
        const [order] = await Order.create(
            [
                {
                    orderId: finalOrderId,
                    userId,
                    items: normalizedItems,
                    vendorDeliveryFees,
                    deliveryAddress,
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

        // 7️⃣ ATOMIC FULFILLMENT (For Wallet Payments)
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
                        customerName: `${req.user?.firstname || ''} ${req.user?.lastname || ''}`.trim() || 'A customer',
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

        // Create VendorOrder
        const [vendorOrder] = await VendorOrder.create(
            [
                {
                    restaurantId: vendorId,
                    userOrderId: order._id,
                    items: vendorItems.map(item => ({
                        foodId: item.foodId,
                        variant: item.variant,
                        quantity: item.quantity,
                        originalPrice: item.price,
                        vendorEarning: Number((item.price * (1 - PLATFORM_COMMISSION)).toFixed(2)),
                        metadata: item.metadata
                    })),
                    commission,
                    vendorTotal,
                    deliveryShare: vendorDeliveryShare,
                    orderStatus: "pending"
                }
            ],
            { session }
        );

        vendorOrderMapping[vendorId] = vendorOrder._id;

        // Update vendor stats
        // ... (rest of the stats/wallet logic)
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

        // Update vendor wallet
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

        const vendorCredit = Number((vendorTotal + vendorDeliveryShare).toFixed(2));
        vendorWallet.balance = Number((vendorWallet.balance + vendorCredit).toFixed(2));
        vendorWallet.transactions.push({
            type: "credit",
            amount: vendorCredit,
            description: `Revenue from Order ${order.orderId}`
        });

        await vendorWallet.save({ session });
    }

    // Update admin wallet (lines 693-725)
    const totalCommission = vendorIds.reduce((sum, vendorId) => {
        const vendorSubtotal = vendorItemsMap[vendorId].reduce(
            (s, item) => s + item.price * item.quantity,
            0
        );
        return sum + vendorSubtotal * PLATFORM_COMMISSION;
    }, 0);

    let adminWallet = await Wallet.findOne({
        ownerModel: "Admin"
    }).session(session);

    if (!adminWallet) {
        const adminUser = await Admin.findOne().session(session);
        if (adminUser) {
            [adminWallet] = await Wallet.create(
                [{ ownerId: adminUser._id, ownerModel: "Admin", balance: 0 }],
                { session }
            );
        }
    }

    if (adminWallet) {
        adminWallet.balance = Number(
            (adminWallet.balance + totalCommission).toFixed(2)
        );
        adminWallet.transactions.push({
            type: "credit",
            amount: Number(totalCommission.toFixed(2)),
            description: `Commission from Order ${order.orderId}`
        });
        await adminWallet.save({ session });
    }

    console.log(`✅ VendorOrders and wallets updated for Order ${order.orderId}`);
    return vendorOrderMapping;
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
        // 1. Find existing order
        const order = await Order.findOne({
            $or: [
                { _id: orderId },
                { orderId: orderId },
                { paymentReference: paymentReference }
            ]
        }).session(session);

        if (!order) {
            throw new Error("Order not found");
        }

        // 2. Check if already processed (idempotency)
        if (order.paymentStatus === "paid") {
            console.log(`⚠️ Order ${order.orderId} already paid. Skipping.`);
            await session.commitTransaction();
            session.endSession();
            return order;
        }

        // 3. Update order status
        order.paymentStatus = "paid";
        order.orderStatus = "accepted";
        await order.save({ session });

        // 4. Create VendorOrders and update wallets
        const vendorOrderMapping = await createVendorOrdersAndUpdateWallets(order, session);

        await session.commitTransaction();
        session.endSession();

        console.log(`✅ Order ${order.orderId} updated to paid`);

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
                    customerName: order.deliveryAddress?.contactName || 'A customer',
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
        const { items, vendorDeliveryFees, deliveryAddress, phone, discountCode, useWallet } = req.body;
        const userId = req.userId; // From auth middleware

        const order = await createOrderV2({
            userId,
            items,
            vendorDeliveryFees,
            deliveryAddress,
            phone,
            discountCode,
            useWallet, // Pass wallet flag
            paymentStatus: "pending" // Will be updated if wallet used
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