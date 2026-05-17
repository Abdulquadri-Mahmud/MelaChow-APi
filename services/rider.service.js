import Rider from "../model/rider.model.js";
import RiderAssignment from "../model/riderAssignment.model.js";
import Vendor from "../model/vendor/vendor.model.js";
import Order from "../model/order/Order.js";
import VendorOrder from "../model/vendor/VendorOrder.js";
import Admin from "../model/Admin/admin.model.js";
import Wallet from "../model/wallet/wallet.mode.js";
import PlatformVehicle from "../model/platformVehicle.model.js";
import State from "../model/location/State.js";
import City from "../model/location/City.js";
import mongoose from "mongoose";
import User from "../model/user.model.js"; // Ensure User model is registered for population
import { releaseEscrowToVendor } from '../controller/order/createOrderV2.controller.js';
import { escrowReleaseQueue } from '../config/queue.js';
import logger from '../config/logger.js';
import { createTransferRecipient } from "./paystackTransfer.service.js";
import { getPlatformConfig } from './platformConfig.service.js';

/**
 * Create a new rider
 * Auto-creates a wallet for every new rider on account creation
 */
export const createRider = async (riderData, vendorId = null) => {
    if (vendorId) {
        const vendor = await Vendor.findById(vendorId);
        if (!vendor || vendor.deletedAt) {
            throw new Error("Vendor not found or inactive");
        }
    }

    const existingRider = await Rider.findOne({ phone: riderData.phone });
    if (existingRider) {
        throw new Error("A rider with this phone number already exists");
    }

    if (riderData.stateId || riderData.cityId) {
        if (!riderData.stateId || !riderData.cityId) {
            throw new Error("State and city must be selected together");
        }

        if (!mongoose.Types.ObjectId.isValid(riderData.stateId) || !mongoose.Types.ObjectId.isValid(riderData.cityId)) {
            throw new Error("Selected rider state or city is invalid");
        }

        const [state, city] = await Promise.all([
            State.findOne({ _id: riderData.stateId, isActive: true }),
            City.findOne({ _id: riderData.cityId, stateId: riderData.stateId, isActive: true }),
        ]);

        if (!state || !city) {
            throw new Error("Selected rider state or city is not active");
        }
    }

    if (riderData.vehicleOwnership === "platform") {
        if (!riderData.platformVehicleId) {
            throw new Error("Select an available platform vehicle for this rider");
        }
        const vehicle = await PlatformVehicle.findOne({
            _id: riderData.platformVehicleId,
            status: "available",
            vehicleType: riderData.vehicleType,
            assignedRiderId: null,
        });
        if (!vehicle) {
            throw new Error("Selected platform vehicle is unavailable or does not match rider vehicle type");
        }
    } else {
        riderData.platformVehicleId = null;
    }

    // Create Paystack recipient if bank details provided
    let finalPayoutDetails = riderData.payoutDetails || { payoutEnabled: false };
    
    if (finalPayoutDetails.bankCode && finalPayoutDetails.accountNumber && finalPayoutDetails.accountName) {
        try {
            const recipientCode = await createTransferRecipient({
                name: finalPayoutDetails.accountName,
                accountNumber: finalPayoutDetails.accountNumber,
                bankCode: finalPayoutDetails.bankCode
            });
            finalPayoutDetails.recipientCode = recipientCode;
            finalPayoutDetails.payoutEnabled = true;
            console.log(`✅ Paystack recipient created for new rider: ${recipientCode}`);
        } catch (err) {
            console.error("⚠️ Failed to create Paystack recipient during rider creation:", err.message);
        }
    }

    const rider = await Rider.create({
        ...riderData,
        vendorId: vendorId || null,
        managedBy: vendorId ? "vendor" : "admin",
        status: "offline",
        isActive: true,
        isVerified: Boolean(riderData.isVerified),
        approvedAt: riderData.isVerified ? new Date() : null,
        payoutDetails: finalPayoutDetails
    });

    if (rider.vehicleOwnership === "platform" && rider.platformVehicleId) {
        await PlatformVehicle.findByIdAndUpdate(rider.platformVehicleId, {
            status: "assigned",
            assignedRiderId: rider._id,
        });
    }

    // Auto-create wallet for rider
    try {
        const existingWallet = await Wallet.findOne({
            ownerId: rider._id,
            ownerModel: "Rider"
        });

        if (!existingWallet) {
            await Wallet.create({
                ownerId: rider._id,
                ownerModel: "Rider",
                balance: 0,
                transactions: []
            });
            console.log(`💰 Wallet created for rider: ${rider._id}`);
        }
    } catch (walletError) {
        console.error(`⚠️ Failed to create wallet for rider ${rider._id}:`, walletError.message);
    }

    if (vendorId) {
        const vendor = await Vendor.findById(vendorId);
        if (vendor) {
            vendor.riders = vendor.riders || [];
            vendor.riders.push(rider._id);
            await vendor.save();
        }
    }

    return rider;
};

/**
 * Get all riders for a vendor with optional filter
 */
export const getRidersByVendor = async (vendorId, filters = {}) => {
    const query = { vendorId, deletedAt: null };
    if (filters.status) {
        query.status = filters.status;
    }
    return Rider.find(query);
};

/**
 * Get full details of a single rider for a vendor
 */
export const getSingleRiderForVendor = async (riderId, vendorId) => {
    const rider = await Rider.findOne({ _id: riderId, vendorId, deletedAt: null }).populate("currentOrderId");
    if (!rider) throw new Error("Rider not found for this vendor");
    return rider.getPublicProfile();
};

/**
 * Get available riders for a vendor
 */
export const getAvailableRiders = async (vendorId) => {
    return Rider.getAvailableForVendor(vendorId);
};

/**
 * ✅ FIX: Get the rider's currently active/assigned order.
 * The frontend calls GET /riders/:riderId/active-order.
 */
export const getActiveOrder = async (riderId) => {
    try {
        if (!riderId || !mongoose.Types.ObjectId.isValid(riderId)) {
            return null;
        }
        
        const rider = await Rider.findById(riderId);
        if (!rider) {
            console.warn(`[getActiveOrder] Rider not found: ${riderId}`);
            return null;
        }

        let activeOrderId = rider.currentOrderId;
        
        if (!activeOrderId) return null;

        let vendorOrder = await VendorOrder.findById(activeOrderId).populate("userOrderId");
        let order = null;
        if (vendorOrder) {
            order = vendorOrder.userOrderId;
        } else {
            order = await Order.findById(activeOrderId);
        }

        if (!order) {
            console.warn(`[getActiveOrder] Active order ${activeOrderId} not found for rider ${riderId}`);
            // Stale reference cleanup logic - only update if actually assigned
            if (rider.currentOrderId && String(rider.currentOrderId) === String(activeOrderId)) {
                await Rider.updateOne({ _id: rider._id }, { $set: { currentOrderId: null } });
            }
            return null;
        }

        // Enrich the order object with flattened fields for the Rider UI
        const orderObj = order.toObject();
        
        // Normalize status for UI consistency
        if (rider.status === "pending_assignment") {
            orderObj.status = "assigned"; 
        } else {
            orderObj.status = vendorOrder ? vendorOrder.orderStatus : order.orderStatus;
        }
        
        const restaurantId = vendorOrder ? vendorOrder.restaurantId : (order.items?.[0]?.restaurantId || order.vendorId);
        const VendorModel = mongoose.model("Vendor");
        const restaurant = await VendorModel.findById(restaurantId).select("storeName address phone location coords logo cityId stateId");
        
        orderObj.restaurantId = restaurant || null;
        orderObj.restaurantName = restaurant?.storeName || "Partner Merchant";
        orderObj.restaurantLogo = restaurant?.logo || null;

        // Customer Name resolution
        const user = await User.findById(order.userId).select("firstname lastname name fullName phone email");
        orderObj.userName = user?.fullName || (user ? `${user.firstname || ""} ${user.lastname || ""}`.trim() : null) || "Customer";
        orderObj.userPhone = user?.phone || order.phone || null;

        // Address resolution
        const addr = order.deliveryAddress;
        orderObj.deliveryFullAddress = addr?.address || addr?.addressLine || (addr ? `${addr.addressLine || ""}, ${addr.cityName || addr.city || ""}`.trim() : null);

        // Limit items if we have a specific vendor order
        if (vendorOrder) {
            orderObj.items = vendorOrder.items;
            orderObj._id = vendorOrder._id;
            orderObj.vendorOrderId = vendorOrder._id;
        }

        // Dynamic platform rider fee
        const platformConfig = await getPlatformConfig();
        orderObj.deliveryFee = platformConfig.riderFixedPayout || 600;

        return orderObj;
    } catch (error) {
        console.error("💥 Error in getActiveOrder service:", error.message);
        return null; 
    }
};

export const getPendingOffers = async (riderId) => {
    try {
        if (!riderId || !mongoose.Types.ObjectId.isValid(riderId)) {
            return [];
        }

        const rider = await Rider.findById(riderId);
        if (!rider) return [];

        const pendingAssignments = await RiderAssignment.find({
            riderId: rider._id,
            status: "assigned",
            expiresAt: { $gt: new Date() },
        }).sort({ createdAt: -1 });

        if (!pendingAssignments.length) return [];

        const offers = [];
        for (const assignment of pendingAssignments) {
            const vendorOrder = await VendorOrder.findById(assignment.vendorOrderId).populate("userOrderId");
            if (!vendorOrder || !vendorOrder.userOrderId) continue;

            const order = vendorOrder.userOrderId;
            // DONT return if order is already assigned to a rider
            if (order.riderId || vendorOrder.riderId) continue;

            const orderObj = order.toObject();
            // Set offer _id to vendorOrder._id! So the rider accepts the specific vendor order.
            orderObj._id = vendorOrder._id;
            orderObj.vendorOrderId = vendorOrder._id;
            orderObj.status = "assigned";

            // Resolve exact restaurant details for this specific vendor order
            const restaurant = await Vendor.findById(vendorOrder.restaurantId).select("storeName address phone location coords logo cityId stateId fullAddress");
            orderObj.restaurantId = restaurant || null;
            orderObj.restaurantName = restaurant?.storeName || "Partner Merchant";
            orderObj.restaurantLogo = restaurant?.logo || null;
            
            const restAddr = restaurant?.address;
            orderObj.restaurantAddress = restaurant?.fullAddress ||
                (restAddr ? `${restAddr.street || restAddr.addressLine || ''}, ${restAddr.city || ''}, ${restAddr.state || ''}`.replace(/^[ ,]+|[ ,]+$/g, '').replace(/, ,/g, ',') : '') ||
                "Restaurant Location";

            const user = await User.findById(order.userId).select("firstname lastname name fullName phone email");
            orderObj.userName = user?.fullName || (user ? `${user.firstname || ""} ${user.lastname || ""}`.trim() : null) || "Customer";
            orderObj.userPhone = user?.phone || order.phone || null;

            const addr = order.deliveryAddress;
            orderObj.deliveryFullAddress = addr?.address || addr?.addressLine || (addr ? `${addr.addressLine || ""}, ${addr.cityName || addr.city || ""}`.trim() : null);

            // Filter items to only show the ones belonging to this specific vendorOrder!
            orderObj.items = vendorOrder.items;

            // DYNAMIC PLATFORM RIDER FEE:
            const platformConfig = await getPlatformConfig();
            const platformRiderFee = platformConfig.riderFixedPayout || 600;
            orderObj.deliveryFee = platformRiderFee;

            offers.push(orderObj);
        }

        return offers;
    } catch (error) {
        console.error("💥 Error in getPendingOffers service:", error.message);
        return [];
    }
};

export const getRiderOrderDetails = async (riderId, orderId) => {
    try {
        let vendorOrder = await VendorOrder.findById(orderId).populate("userOrderId");
        let order = null;
        if (vendorOrder) {
            order = vendorOrder.userOrderId;
        } else {
            order = await Order.findById(orderId);
        }

        if (!order) return null;

        const orderObj = order.toObject();
        
        // Dynamic platform rider fee
        const platformConfig = await getPlatformConfig();
        orderObj.riderEarnings = platformConfig.riderFixedPayout || 600;
        orderObj.deliveryFee = platformConfig.riderFixedPayout || 600;

        const restaurantId = vendorOrder ? vendorOrder.restaurantId : (order.items?.[0]?.restaurantId || order.vendorId);
        if (restaurantId) {
            const VendorModel = mongoose.model("Vendor");
            const restaurant = await VendorModel.findById(restaurantId).select("storeName address phone location logo");
            if (restaurant) {
                orderObj.restaurantId = restaurant;
                orderObj.restaurantName = restaurant.storeName || "Partner Merchant";
                
                const rAddr = restaurant.address;
                orderObj.restaurantAddress = rAddr?.fullAddress || rAddr?.street || 
                    (typeof rAddr === 'string' ? rAddr : "Restaurant Address");
            }
        }

        if (!orderObj.restaurantName) orderObj.restaurantName = "Partner Merchant";

        const user = await User.findById(order.userId).select("firstname lastname name fullName phone email");
        orderObj.userName = user?.fullName || (user ? `${user.firstname || ""} ${user.lastname || ""}`.trim() : null) || "Customer";
        orderObj.userPhone = user?.phone || order.phone || null;

        const addr = order.deliveryAddress;
        orderObj.deliveryFullAddress = addr?.address || addr?.addressLine || (addr ? `${addr.addressLine || ""}, ${addr.cityName || addr.city || ""}`.trim() : null);

        if (vendorOrder) {
            orderObj.items = vendorOrder.items;
            orderObj._id = vendorOrder._id;
            orderObj.vendorOrderId = vendorOrder._id;
        }

        return orderObj;
    } catch (error) {
        console.error(`💥 Error in getRiderOrderDetails service for Order ${orderId}:`, error.message);
        throw error;
    }
};

/**
 * Assign a rider to an order (Manual flow - Keep for fallback/admin use)
 */
export const assignRiderToOrder = async (orderId, riderId, vendorId) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const order = await Order.findById(orderId).session(session);
        if (!order) throw new Error("Order not found");
        
        const rider = await Rider.findById(riderId).session(session);
        if (!rider) throw new Error("Rider not found");

        order.orderStatus = "rider_assigned";
        order.riderId = riderId;
        order.statusLog.push({
            status: "rider_assigned",
            changedBy: "manual_assignment",
            timestamp: new Date()
        });
        await order.save({ session });

        await VendorOrder.updateMany(
            { userOrderId: order._id },
            { orderStatus: "rider_assigned" },
            { session }
        );

        await Rider.findByIdAndUpdate(
            riderId,
            { status: "pending_assignment", currentOrderId: orderId, assignmentExpiresAt: new Date(Date.now() + 5 * 60 * 1000) },
            { session }
        );

        await session.commitTransaction();
        
        // 🔔 Send Rider Notification
        try {
            const { sendRiderNotification } = await import('../services/notification.service.js');
            await sendRiderNotification(riderId, order._id, "order_assigned", {
                restaurantName: order.storeName || "a restaurant",
                orderDatabaseId: order._id,
                payout: 600
            });
        } catch (e) { console.error('⚠️ Notification error (rider):', e.message); }

        return { order, rider };
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

/**
 * Mark order as picked up by rider
 */
export const markPickedUp = async (orderId, riderId) => {
    let vendorOrder = await VendorOrder.findById(orderId).populate("userOrderId");
    let order = null;
    if (vendorOrder) {
        order = vendorOrder.userOrderId;
    } else {
        order = await Order.findById(orderId);
    }
    if (!order) throw new Error("Order not found");

    const isAssigned = (order.riderId?.toString() === riderId) || (vendorOrder && vendorOrder.riderId?.toString() === riderId);
    if (!isAssigned) throw new Error("Rider not assigned to this order");

    const rider = await Rider.findById(riderId);
    if (!rider) throw new Error("Rider not found");

    order.orderStatus = "out_for_delivery";
    order.riderAssignment = {
        ...(order.riderAssignment || {}),
        status: "picked_up",
        lastReason: ""
    };
    order.statusLog.push({
        status: "out_for_delivery",
        changedBy: "rider",
        timestamp: new Date()
    });
    await order.save();

    if (vendorOrder) {
        vendorOrder.orderStatus = "out_for_delivery";
        await vendorOrder.save();
    } else {
        await VendorOrder.updateMany(
            { userOrderId: order._id },
            { $set: { orderStatus: "out_for_delivery" } }
        );
    }

    // Move rider to on_delivery
    await Rider.findByIdAndUpdate(riderId, { status: "on_delivery" });
    await RiderAssignment.findOneAndUpdate(
        { riderId, orderId: order._id, status: { $in: ["assigned", "accepted"] } },
        { $set: { status: "picked_up", respondedAt: new Date() } },
        { sort: { createdAt: -1 } }
    );

    return order;
};

/**
 * Mark order as delivered by rider
 */
export const markDelivered = async (orderId, riderId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    let completedOrder = null;
    let pendingRiderPayout = null; 
    let payoutActuallyCredited = false; 

    try {
        let vendorOrder = await VendorOrder.findById(orderId).populate("userOrderId").session(session);
        let order = null;
        if (vendorOrder) {
            order = vendorOrder.userOrderId;
        } else {
            order = await Order.findById(orderId).session(session);
        }
        if (!order) throw new Error("Order not found");

        const isAssigned = (order.riderId?.toString() === riderId) || (vendorOrder && vendorOrder.riderId?.toString() === riderId);
        if (!isAssigned) throw new Error("Rider not assigned to this order");

        const rider = await Rider.findById(riderId).session(session);
        if (!rider) throw new Error("Rider not found");

        order.orderStatus = "delivered";
        order.riderAssignment = {
            ...(order.riderAssignment || {}),
            status: "delivered",
            lastReason: ""
        };
        order.statusLog.push({
            status: "delivered",
            changedBy: "rider",
            timestamp: new Date()
        });
        await order.save({ session });

        if (vendorOrder) {
            vendorOrder.orderStatus = "delivered";
            await vendorOrder.save({ session });
        } else {
            await VendorOrder.updateMany(
                { userOrderId: order._id },
                { $set: { orderStatus: "delivered" } },
                { session }
            );
        }

        const riderVendorId = rider.vendorId?.toString();
        const isAdminRider = rider.managedBy === 'admin';

        let deliveryFee = 0;
        if (isAdminRider) {
            const platformConfig = await getPlatformConfig();
            deliveryFee = platformConfig.riderFixedPayout || 600;
        } else {
            const deliveryFeeEntry = order.vendorDeliveryFees?.find(
                v => v.restaurantId?.toString() === riderVendorId
            );
            deliveryFee = Number(deliveryFeeEntry?.deliveryFee || 0);
            if (deliveryFee === 0) {
                const vendorPromo = order.vendorDeliveryPromo;
                if (vendorPromo?.applied && String(vendorPromo.vendorId) === riderVendorId) {
                    deliveryFee = vendorPromo.originalDeliveryFee;
                } else if (order.freeDeliveryPromo?.eligible) {
                    deliveryFee = order.freeDeliveryPromo.originalDeliveryFee;
                }
            }
        }

        let riderEarningsToRecord = 0;

        if (deliveryFee > 0) {
            const platformConfig = await getPlatformConfig();
            const RIDER_FIXED_PAYOUT = platformConfig.riderFixedPayout || 600;

            const riderPayout = Math.min(RIDER_FIXED_PAYOUT, deliveryFee);
            const platformSpread = Number((deliveryFee - riderPayout).toFixed(2));

            pendingRiderPayout = {
                riderId,
                riderPayout,
                platformSpread,
                orderId: order.orderId,
                orderDbId: order._id,
                RIDER_FIXED_PAYOUT,
            };

            riderEarningsToRecord = riderPayout;
        }

        order.riderEarnings = riderEarningsToRecord;
        await order.save({ session });

        // Find if this rider has any other active/accepted orders
        const activeOrdersCount = await mongoose.model("VendorOrder").countDocuments({
            riderId,
            orderStatus: { $in: ["accepted", "out_for_delivery", "rider_assigned"] },
            _id: { $ne: orderId }
        }).session(session);

        const activeMasterOrdersCount = await mongoose.model("Order").countDocuments({
            riderId,
            orderStatus: { $in: ["accepted", "out_for_delivery", "rider_assigned"] },
            _id: { $ne: orderId }
        }).session(session);

        const hasRemainingOrders = activeOrdersCount > 0 || activeMasterOrdersCount > 0;

        if (hasRemainingOrders) {
            rider.totalDeliveries += 1;
            if (riderEarningsToRecord > 0) {
                rider.totalEarnings += riderEarningsToRecord;
            }
            // Set currentOrderId to one of the remaining active orders
            const nextOrder = await mongoose.model("VendorOrder").findOne({
                riderId,
                orderStatus: { $in: ["accepted", "out_for_delivery", "rider_assigned"] },
                _id: { $ne: orderId }
            }).session(session);

            if (nextOrder) {
                rider.currentOrderId = nextOrder._id;
            } else {
                const nextMaster = await mongoose.model("Order").findOne({
                    riderId,
                    orderStatus: { $in: ["accepted", "out_for_delivery", "rider_assigned"] },
                    _id: { $ne: orderId }
                }).session(session);
                if (nextMaster) rider.currentOrderId = nextMaster._id;
            }
        } else {
            await rider.freeUp(riderEarningsToRecord);
        }

        rider.assignmentExpiresAt = null;
        await rider.save({ session });

        await RiderAssignment.findOneAndUpdate(
            { riderId, orderId: order._id, status: { $in: ["assigned", "accepted", "picked_up"] } },
            { $set: { status: "delivered", respondedAt: new Date() } },
            { session, sort: { createdAt: -1 } }
        );
        await session.commitTransaction();

        completedOrder = order;

    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }

    if (pendingRiderPayout && completedOrder) {
        try {
            const {
                riderId: payoutRiderId,
                riderPayout,
                platformSpread,
                orderId: readableOrderId,
                orderDbId,
                RIDER_FIXED_PAYOUT,
            } = pendingRiderPayout;

            const adminWallet = await Wallet.findOne({ ownerModel: "Admin" });
            if (!adminWallet) throw new Error("Admin wallet not found for rider payout");

            if (adminWallet.balance < riderPayout) {
                logger.error(
                    { orderId: readableOrderId, riderPayout, adminBalance: adminWallet.balance },
                    '⚠️ Admin wallet insufficient for rider payout'
                );
                try {
                    const { sendNotification } = await import('../services/notification.service.js');
                    await sendNotification(null, 'admin_insufficient_funds', {
                        adminBalance: adminWallet.balance,
                        riderPayout,
                        orderId: readableOrderId,
                        orderDatabaseId: orderDbId
                    }, 'admin');
                } catch (notifErr) { logger.error('❌ Admin notification failed', notifErr.message); }
            } else {
                adminWallet.balance = Number((adminWallet.balance - riderPayout).toFixed(2));
                adminWallet.transactions.push({
                    type: "debit",
                    amount: riderPayout,
                    description: `Rider payout for Order ${readableOrderId}`,
                    transactionType: 'rider_payout',
                });
                adminWallet.transactions.push({
                    type: "debit",
                    amount: 0,
                    reportingAmount: platformSpread,
                    description: `Delivery spread for Order ${readableOrderId}`,
                    transactionType: 'delivery_spread',
                });
                await adminWallet.save();

                let riderWallet = await Wallet.findOne({ ownerId: payoutRiderId, ownerModel: "Rider" });
                if (!riderWallet) {
                    riderWallet = await Wallet.create({
                        ownerId: payoutRiderId,
                        ownerModel: "Rider",
                        balance: 0,
                        transactions: [],
                    });
                }

                riderWallet.balance = Number((riderWallet.balance + riderPayout).toFixed(2));
                riderWallet.totalEarned = Number(((riderWallet.totalEarned || 0) + riderPayout).toFixed(2));
                riderWallet.transactions.push({
                    type: "credit",
                    amount: riderPayout,
                    description: `Delivery payout for Order ${readableOrderId}`,
                    transactionType: 'rider_payout',
                });
                await riderWallet.save();

                payoutActuallyCredited = true;
            }
        } catch (payoutErr) {
            logger.error({ orderId: completedOrder.orderId, error: payoutErr.message }, '❌ Post-transaction rider payout failed');
        }
    }

    if (completedOrder) {
        const allVendorOrders = await VendorOrder.find({ userOrderId: completedOrder._id });
        for (const vo of allVendorOrders) {
            try {
                await releaseEscrowToVendor(vo._id);
            } catch (escrowErr) {
                logger.error({ orderId: completedOrder._id, vendorOrderId: vo._id, error: escrowErr.message }, '❌ Escrow release failed');
            }
        }
    }

    return {
        order: completedOrder,
        payoutCredited: payoutActuallyCredited,
    };
};

/**
 * Update rider status manually (rider self-service)
 */
export const updateRiderStatus = async (riderId, status, reason = null) => {
    const rider = await Rider.findById(riderId);
    if (!rider) throw new Error("Rider not found");

    if (!["available", "offline", "on_delivery"].includes(status)) {
        throw new Error("Invalid status update");
    }

    if (!rider.isVerified && status === "available") {
        throw new Error("Your rider account is pending admin approval");
    }

    // Allow going offline from 'pending_assignment' if no confirmed order is being delivered.
    // 'currentOrderId' is set once the rider actually accepts the order.
    if (status === "offline" && (rider.status === "on_delivery" || rider.currentOrderId)) {
        throw new Error("You cannot go offline while on an active delivery!");
    }

    if (status === "on_delivery" && rider.status !== "pending_assignment") {
        // ✅ IDEMPOTENCY: If already on delivery, just return success
        if (rider.status === "on_delivery") return rider;
        throw new Error("You can only transition to on_delivery from pending_assignment");
    }

    // ✅ IMPROVED: If rider is rejecting a broadcast offer (status === "available")
    if (status === "available") {
        if (rider.status === "pending_assignment" || rider.status === "on_delivery") {
            // Find the active assignment they are rejecting
            const activeAssignment = await RiderAssignment.findOne({
                riderId,
                status: "assigned",
                expiresAt: { $gt: new Date() }
            }).sort({ createdAt: -1 });

            if (activeAssignment) {
                await RiderAssignment.updateOne(
                    { _id: activeAssignment._id },
                    { $set: { status: "rejected", respondedAt: new Date(), reason: reason || "rider_rejected_broadcast" } }
                );
                console.log(`❌ Rider ${riderId} rejected broadcast for Order ${activeAssignment.orderId}`);
            }
        }
        
        // If rider is currently on delivery or has an active order, KEEP them on delivery!
        if (rider.status === "on_delivery" || rider.currentOrderId) {
            rider.assignmentExpiresAt = null;
            await rider.save();
            return rider;
        }

        rider.currentOrderId = null;
        rider.assignmentExpiresAt = null;
    }

    rider.status = status;
    await rider.save();
    return rider;
};

/**
 * Update rider info by vendor
 */
export const updateRider = async (riderId, vendorId, updateData) => {
    const rider = await Rider.findOne({ _id: riderId, vendorId });
    if (!rider) throw new Error("Rider not found for this vendor");

    const allowedUpdates = ["name", "phone", "notes", "isActive", "avatar", "metadata"];
    allowedUpdates.forEach(key => {
        if (updateData[key] !== undefined) {
            rider[key] = updateData[key];
        }
    });

    await rider.save();
    return rider.getPublicProfile();
};

/**
 * Rider updates their own profile info
 */
export const riderUpdateSelf = async (riderId, updateData) => {
    const rider = await Rider.findById(riderId);
    if (!rider) throw new Error("Rider not found");

    const allowedUpdates = ["name", "phone", "avatar", "email"];
    allowedUpdates.forEach(key => {
        if (updateData[key] !== undefined) {
            rider[key] = updateData[key];
        }
    });

    if (updateData.password) {
        rider.password = updateData.password;
    }

    await rider.save();
    return rider.getPublicProfile();
};

/**
 * Deactivate/Soft-delete rider
 */
export const deactivateRider = async (riderId, vendorId) => {
    const rider = await Rider.findOne({ _id: riderId, vendorId });
    if (!rider) throw new Error("Rider not found for this vendor");

    if (rider.currentOrderId) {
        throw new Error("Cannot deactivate rider mid-delivery");
    }

    rider.isActive = false;
    rider.deletedAt = new Date();
    const vehicleId = rider.platformVehicleId;
    rider.platformVehicleId = null;
    await rider.save();
    if (vehicleId) {
        await PlatformVehicle.findByIdAndUpdate(vehicleId, {
            status: "available",
            assignedRiderId: null,
        });
    }
    return rider;
};

/**
 * Admin: Get all riders in the system
 */
export const getAllRiders = async (filters = {}) => {
    const query = { deletedAt: null };
    if (filters.status) query.status = filters.status;
    if (filters.vendorId) query.vendorId = filters.vendorId;
    if (filters.managedBy) query.managedBy = filters.managedBy;
    if (filters.cityId) query.cityId = filters.cityId;
    if (filters.stateId) query.stateId = filters.stateId;
    if (filters.isVerified !== undefined) query.isVerified = filters.isVerified === true || filters.isVerified === "true";
    if (filters.isActive !== undefined) query.isActive = filters.isActive;
    
    if (filters.available === 'true' || filters.available === true) {
        query.status = 'available';
        query.isActive = true;
        query.isVerified = true;
        query.currentOrderId = null;
    }

    return Rider.find(query)
        .populate("vendorId", "storeName email phone")
        .populate("stateId", "name")
        .populate("cityId", "name stateId")
        .populate("platformVehicleId", "label identifier vehicleType status");
};

/**
 * Admin: Update any rider
 */
export const adminUpdateRider = async (riderId, updateData) => {
    const rider = await Rider.findById(riderId);
    if (!rider) throw new Error("Rider not found");

    const allowedUpdates = [
        "name", "phone", "notes", "isActive", "avatar", "metadata",
        "vendorId", "status", "stateId", "cityId", "serviceZones", "vehicleOwnership", "vehicleType", "platformVehicleId", "isVerified",
        "locationStatus", "requestedState", "requestedCity"
    ];

    if (rider.currentOrderId && (updateData.status || updateData.vendorId !== undefined || updateData.cityId !== undefined || updateData.stateId !== undefined)) {
        throw new Error("Cannot change rider status, vendor, or city while the rider has an active assignment");
    }

    const previousVehicleId = rider.platformVehicleId?.toString() || null;
    const nextVehicleOwnership = updateData.vehicleOwnership ?? rider.vehicleOwnership;
    const nextVehicleType = updateData.vehicleType ?? rider.vehicleType;
    const nextVehicleId = nextVehicleOwnership === "platform" ? (updateData.platformVehicleId ?? rider.platformVehicleId) : null;

    if (nextVehicleOwnership === "platform") {
        if (!nextVehicleId) throw new Error("Select an available platform vehicle for this rider");
        const vehicle = await PlatformVehicle.findOne({
            _id: nextVehicleId,
            vehicleType: nextVehicleType,
            $or: [
                { status: "available", assignedRiderId: null },
                { assignedRiderId: rider._id },
            ],
        });
        if (!vehicle) throw new Error("Selected platform vehicle is unavailable or does not match rider vehicle type");
    }

    allowedUpdates.forEach(key => {
        if (updateData[key] !== undefined) {
            rider[key] = key === "vendorId" && !updateData[key] ? null : updateData[key];
        }
    });

    if (updateData.stateId && updateData.cityId) {
        rider.locationStatus = "approved";
        rider.requestedState = "";
        rider.requestedCity = "";
    }

    if (nextVehicleOwnership !== "platform") {
        rider.platformVehicleId = null;
    }

    if (updateData.isVerified === true && !rider.approvedAt) {
        rider.approvedAt = new Date();
        rider.approvedBy = updateData.approvedBy || null;
    }

    if (updateData.isVerified === false) {
        rider.approvedAt = null;
        rider.approvedBy = null;
        if (rider.status === "available") rider.status = "offline";
    }

    if (updateData.vendorId === null || updateData.vendorId === "") {
        rider.managedBy = "admin";
    }

    if (updateData.password) {
        rider.password = updateData.password;
    }

    if (updateData.payoutDetails) {
        const currentPayout = rider.payoutDetails || {};
        const newPayout = updateData.payoutDetails;
        const bankChanged = newPayout.accountNumber !== currentPayout.accountNumber || newPayout.bankCode !== currentPayout.bankCode;

        if (bankChanged && newPayout.accountNumber && newPayout.bankCode && newPayout.accountName) {
            try {
                const recipientCode = await createTransferRecipient({
                    name: newPayout.accountName,
                    accountNumber: newPayout.accountNumber,
                    bankCode: newPayout.bankCode
                });
                newPayout.recipientCode = recipientCode;
                newPayout.payoutEnabled = true;
            } catch (err) {
                console.error("⚠️ Paystack recipient error:", err.message);
            }
        }
        rider.payoutDetails = { ...currentPayout, ...newPayout };
    }

    await rider.save();
    const savedVehicleId = rider.platformVehicleId?.toString() || null;
    if (previousVehicleId && previousVehicleId !== savedVehicleId) {
        await PlatformVehicle.findByIdAndUpdate(previousVehicleId, { status: "available", assignedRiderId: null });
    }
    if (savedVehicleId) {
        await PlatformVehicle.findByIdAndUpdate(savedVehicleId, { status: "assigned", assignedRiderId: rider._id });
    }
    return rider.getPublicProfile();
};

export const adminApproveRider = async (riderId, adminId) => {
    const rider = await Rider.findById(riderId);
    if (!rider) throw new Error("Rider not found");
    if (!rider.isActive || rider.deletedAt) throw new Error("Cannot approve an inactive rider");
    if (!rider.cityId || !rider.stateId) throw new Error("Assign the rider's state and city before approval");

    rider.isVerified = true;
    rider.locationStatus = "approved";
    rider.requestedState = "";
    rider.requestedCity = "";
    rider.approvedAt = new Date();
    rider.approvedBy = adminId || null;
    await rider.save();
    return rider.getPublicProfile();
};

export const getAssignmentHistory = async (filters = {}) => {
    const query = {};
    if (filters.riderId) query.riderId = filters.riderId;
    if (filters.orderId) query.orderId = filters.orderId;
    if (filters.status) query.status = filters.status;
    if (filters.cityId) query.cityId = filters.cityId;
    return RiderAssignment.find(query)
        .populate("riderId", "name phone status cityId stateId")
        .populate("vendorId", "storeName")
        .populate("cityId", "name")
        .populate("stateId", "name")
        .sort({ createdAt: -1 })
        .limit(Number(filters.limit || 100));
};

export const adminDeactivateRider = async (riderId) => {
    const rider = await Rider.findById(riderId);
    if (!rider) throw new Error("Rider not found");
    if (rider.currentOrderId) throw new Error("Cannot deactivate rider mid-delivery");
    rider.isActive = false;
    rider.deletedAt = new Date();
    return rider.save();
};

export const getRiderWallet = async (riderId) => {
    let wallet = await Wallet.findOne({ ownerId: riderId, ownerModel: "Rider" });
    if (!wallet) {
        wallet = await Wallet.create({
            ownerId: riderId,
            ownerModel: "Rider",
            balance: 0,
            transactions: []
        });
    }
    return wallet;
};

export const getRiderHistorySummary = async (riderId, filters = {}) => {
    const rider = await Rider.findById(riderId).populate('cityId stateId');
    if (!rider) throw new Error('Rider not found');

    const config = await getPlatformConfig();
    const payoutHour = Number(filters.payoutHour ?? config.riderPayoutHour ?? 10);
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const payoutCutoff = new Date(todayStart);
    payoutCutoff.setHours(payoutHour, 0, 0, 0);

    const nextPayout = new Date(payoutCutoff);
    if (now >= payoutCutoff) {
        nextPayout.setDate(nextPayout.getDate() + 1);
    }

    const wallet = await Wallet.findOne({ ownerId: riderId, ownerModel: 'Rider' }).lean();
    const transactions = wallet?.transactions || [];

    const payoutsToday = transactions.filter((tx) =>
        tx.transactionType === 'rider_payout' &&
        new Date(tx.date) >= todayStart &&
        new Date(tx.date) <= now
    );

    const payoutsBeforeCutoff = payoutsToday.filter((tx) => new Date(tx.date) < payoutCutoff);
    const ridesBeforePayout = new Set(payoutsBeforeCutoff.map((tx) => tx.orderId?.toString())).size;
    const earningsBeforePayout = payoutsBeforeCutoff.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const payoutsAfterCutoff = payoutsToday.filter((tx) => new Date(tx.date) >= payoutCutoff);
    const ridesAfterCutoff = new Set(payoutsAfterCutoff.map((tx) => tx.orderId?.toString())).size;
    const earningsAfterCutoff = payoutsAfterCutoff.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    return {
        rider: rider.getPublicProfile ? rider.getPublicProfile() : rider,
        payoutHour,
        payoutCutoff,
        nextPayout,
        earnings: {
            totalToday: payoutsToday.reduce((sum, tx) => sum + Number(tx.amount || 0), 0),
            beforePayout: earningsBeforePayout,
            afterPayout: earningsAfterCutoff,
        },
        rides: {
            today: new Set(payoutsToday.map((tx) => tx.orderId?.toString())).size,
            beforePayout: ridesBeforePayout,
            afterPayout: ridesAfterCutoff,
        },
        transactions: payoutsToday.sort((a, b) => new Date(b.date) - new Date(a.date)),
    };
};
