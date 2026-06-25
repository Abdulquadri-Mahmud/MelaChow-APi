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
import { escrowReleaseQueue, deliveryWatchdogQueue, disputeEscalationQueue } from '../config/queue.js';
import logger from '../config/logger.js';
import { createTransferRecipient } from "./paystackTransfer.service.js";
import { getPlatformConfig } from './platformConfig.service.js';
import { RIDER_FIXED_PAYOUT } from '../config/payouts.js';
import OrderTermination from '../model/OrderTermination.js';
import { offerOrderToAvailableRiders } from './riderAssignment.service.js';

const throwClientError = (msg) => {
    const err = new Error(msg);
    err.statusCode = 400;
    throw err;
};

/**
 * Create a new rider
 * Auto-creates a wallet for every new rider on account creation
 */
export const createRider = async (riderData, vendorId = null) => {
    if (vendorId) {
        const vendor = await Vendor.findById(vendorId);
        if (!vendor || vendor.deletedAt) {
            throwClientError("Vendor not found or inactive");
        }
    }

    const existingRider = await Rider.findOne({ phone: riderData.phone });
    if (existingRider) {
        throwClientError("A rider with this phone number already exists");
    }

    if (riderData.stateId || riderData.cityId) {
        if (!riderData.stateId || !riderData.cityId) {
            throwClientError("State and city must be selected together");
        }

        if (!mongoose.Types.ObjectId.isValid(riderData.stateId) || !mongoose.Types.ObjectId.isValid(riderData.cityId)) {
            throwClientError("Selected rider state or city is invalid");
        }

        const [state, city] = await Promise.all([
            State.findOne({ _id: riderData.stateId, isActive: true }),
            City.findOne({ _id: riderData.cityId, stateId: riderData.stateId, isActive: true }),
        ]);

        if (!state || !city) {
            throwClientError("Selected rider state or city is not active");
        }
    }

    if (riderData.vehicleOwnership === "platform") {
        if (!riderData.platformVehicleId) {
            throwClientError("Select an available platform vehicle for this rider");
        }
        const vehicle = await PlatformVehicle.findOne({
            _id: riderData.platformVehicleId,
            status: "available",
            vehicleType: riderData.vehicleType,
            assignedRiderId: null,
        });
        if (!vehicle) {
            throwClientError("Selected platform vehicle is unavailable or does not match rider vehicle type");
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
        orderObj.deliveryFee = platformConfig.riderFixedPayout ?? RIDER_FIXED_PAYOUT;

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
            const platformRiderFee = platformConfig.riderFixedPayout ?? RIDER_FIXED_PAYOUT;
            orderObj.deliveryFee = platformRiderFee;

            // Check for termination record on this order
            const termination = await OrderTermination.findOne({
                orderId:  order._id,
                status:   "pending",
            }).sort({ terminatedAt: -1 }).lean();

            if (termination) {
                orderObj.previousRider = {
                    name:         termination.previousRiderName,
                    phone:        termination.previousRiderPhone,
                    foodPickedUp: termination.foodPickedUp,
                    terminatedAt: termination.terminatedAt,
                    reason:       termination.reason,
                };
                orderObj.hasPreviousRider = true;
            } else {
                orderObj.hasPreviousRider = false;
                orderObj.previousRider    = null;
            }

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
        orderObj.riderEarnings = platformConfig.riderFixedPayout ?? RIDER_FIXED_PAYOUT;
        orderObj.deliveryFee = platformConfig.riderFixedPayout ?? RIDER_FIXED_PAYOUT;

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
            const config = await getPlatformConfig();
            await sendRiderNotification(riderId, order._id, "order_assigned", {
                restaurantName: order.storeName || "a restaurant",
                orderDatabaseId: order._id,
                payout: config.riderFixedPayout ?? RIDER_FIXED_PAYOUT,
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
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        let vendorOrder = await VendorOrder.findById(orderId).populate("userOrderId").session(session);
        let order = null;
        if (vendorOrder) {
            order = vendorOrder.userOrderId;
        } else {
            order = await Order.findById(orderId).session(session);
        }
        if (!order) throw new Error("Order not found");

        const isAssigned = (order.riderId?.toString() === riderId) ||
                           (vendorOrder && vendorOrder.riderId?.toString() === riderId);
        if (!isAssigned) throw new Error("Rider not assigned to this order");

        const rider = await Rider.findById(riderId).session(session);
        if (!rider) throw new Error("Rider not found");

        order.orderStatus = "out_for_delivery";
        order.riderAssignment = {
            ...(order.riderAssignment || {}),
            status: "picked_up",
            lastReason: "",
        };
        order.statusLog.push({ status: "out_for_delivery", changedBy: "rider", timestamp: new Date() });
        await order.save({ session });

        if (vendorOrder) {
            vendorOrder.orderStatus = "out_for_delivery";
            await vendorOrder.save({ session });
        } else {
            await VendorOrder.updateMany(
                { userOrderId: order._id },
                { $set: { orderStatus: "out_for_delivery" } },
                { session }
            );
        }

        await Rider.findByIdAndUpdate(
            riderId,
            { status: "on_delivery" },
            { session }
        );

        await RiderAssignment.findOneAndUpdate(
            { riderId, orderId: order._id, status: { $in: ["assigned", "accepted"] } },
            { $set: { status: "picked_up", respondedAt: new Date() } },
            { session, sort: { createdAt: -1 } }
        );

        await session.commitTransaction();
        return order;
    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

/**
 * Mark order as delivered by rider
 */
export const markDelivered = async (orderId, riderId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    let completedOrder = null;
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

        const isAdminRider = rider.managedBy === 'admin';

        // Vendor-managed delivery is retired. Any non-admin rider reaching
        // this point is a data integrity error — surface it immediately
        // rather than silently paying ₦0.
        if (!isAdminRider) {
            logger.error(
                { riderId, orderId: order._id, managedBy: rider.managedBy },
                '❌ Non-admin rider hit delivery completion — vendor-managed flow is retired'
            );
            throw new Error('Delivery flow error: vendor-managed riders are not supported. Contact admin.');
        }

        const platformConfig = await getPlatformConfig();
        const deliveryFee = platformConfig.riderFixedPayout ?? RIDER_FIXED_PAYOUT;

        let riderEarningsToRecord = 0;
        let riderPayout = 0;
        let platformSpread = 0;

        if (deliveryFee > 0) {
            const riderPayoutLimit = platformConfig.riderFixedPayout ?? RIDER_FIXED_PAYOUT;
            riderPayout = Math.min(riderPayoutLimit, deliveryFee);
            platformSpread = Number((deliveryFee - riderPayout).toFixed(2));
            riderEarningsToRecord = riderPayout;
        }

        order.riderEarnings = riderEarningsToRecord;
        await order.save({ session });

        // ── LOOPHOLE 3 FIX: Wallet writes inside the session ─────────────────────
        // Previously these were OUTSIDE the session (post-commit), meaning a server
        // crash could mark the order as delivered but never credit the rider wallet.
        // Now the wallet debits/credits are atomic with the order status update.
        if (riderPayout > 0) {
            const adminWallet = await Wallet.findOne({ ownerModel: "Admin" }).session(session);

            if (!adminWallet) {
                // Critical: log but do NOT abort the delivery confirmation.
                // The delivery is real; flag for manual reconciliation.
                logger.error(
                    { orderId: order.orderId, riderPayout },
                    '⚠️ Admin wallet not found — rider payout skipped, manual reconciliation required'
                );
            } else if (adminWallet.balance < riderPayout) {
                logger.error(
                    { orderId: order.orderId, riderPayout, adminBalance: adminWallet.balance },
                    '⚠️ Admin wallet insufficient for rider payout — delivery confirmed, payout deferred'
                );
                try {
                    const { sendNotification } = await import('./notification.service.js');
                    await sendNotification(null, 'admin_insufficient_funds', {
                        adminBalance: adminWallet.balance,
                        riderPayout,
                        orderId: order.orderId,
                        orderDatabaseId: order._id
                    }, 'admin');
                } catch (notifErr) {
                    logger.error({ error: notifErr.message }, '❌ Admin insufficient-funds notification failed');
                }
            } else {
                // Debit admin wallet
                adminWallet.balance = Number((adminWallet.balance - riderPayout).toFixed(2));
                adminWallet.transactions.push({
                    type: "debit",
                    amount: riderPayout,
                    description: `Rider payout for Order ${order.orderId}`,
                    transactionType: 'rider_payout',
                    orderId: order._id,
                });
                if (platformSpread > 0) {
                    adminWallet.transactions.push({
                        type: "debit",
                        amount: 0,
                        reportingAmount: platformSpread,
                        description: `Delivery spread for Order ${order.orderId}`,
                        transactionType: 'delivery_spread',
                        orderId: order._id,
                    });
                }
                await adminWallet.save({ session });

                // Credit rider wallet (upsert — creates wallet on first delivery)
                await Wallet.findOneAndUpdate(
                    { ownerId: riderId, ownerModel: "Rider" },
                    {
                        $inc: { balance: riderPayout, totalEarned: riderPayout },
                        $push: {
                            transactions: {
                                type: "credit",
                                amount: riderPayout,
                                description: `Delivery payout for Order ${order.orderId}`,
                                transactionType: 'rider_payout',
                                orderId: order._id,
                                date: new Date(),
                            }
                        }
                    },
                    { new: true, upsert: true, session, setDefaultsOnInsert: true }
                );

                payoutActuallyCredited = true;
                logger.info({ orderId: order.orderId, riderPayout }, '✅ Rider payout credited inside session');
            }
        }

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

    // ── LOOPHOLE 3 FIX: Escrow release via BullMQ queue (retry-safe) ─────────────
    // Previously: bare `await releaseEscrowToVendor(vo._id)` calls outside session —
    // a server crash here would leave vendor escrow unreleased forever.
    // Now: enqueued to escrowReleaseQueue (attempts: 5, exponential backoff)
    // so the worker retries automatically if the process dies mid-release.
    if (completedOrder) {
        const allVendorOrders = await VendorOrder.find({ userOrderId: completedOrder._id }).select("_id");
        for (const vo of allVendorOrders) {
            try {
                await escrowReleaseQueue.add(
                    "release-escrow",
                    { vendorOrderId: vo._id.toString() },
                    {
                        jobId: `escrow-${vo._id}`, // idempotent: duplicate adds are no-ops
                    }
                );
            } catch (queueErr) {
                // Redis down — fall back to direct release as last resort
                logger.error({ vendorOrderId: vo._id, error: queueErr.message }, '❌ Escrow queue add failed — attempting direct release');
                try {
                    await releaseEscrowToVendor(vo._id);
                } catch (escrowErr) {
                    logger.error(
                        { orderId: completedOrder._id, vendorOrderId: vo._id, error: escrowErr.message },
                        '❌ Escrow direct release also failed — manual reconciliation required'
                    );
                }
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

    if (status === "on_delivery" && rider.status !== "pending_assignment" && rider.status !== "available") {
        // ✅ IDEMPOTENCY: If already on delivery, just return success
        if (rider.status === "on_delivery") return rider;
        throw new Error("You can only transition to on_delivery from pending_assignment or available");
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
    // payoutHour must always come from platform config — never from caller input.
    // A rider passing ?payoutHour=0 must not be able to shift financial window calculations.
    const payoutHour = Number(config.riderPayoutHour ?? 10);
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

/**
 * Rider-initiated order termination.
 * Resets the order, logs the termination, applies strike if food was already picked up,
 * and re-broadcasts to available riders.
 *
 * @param {string} orderId    - VendorOrder _id (what the rider holds) or Order _id
 * @param {string} riderId    - Rider _id
 * @param {string} [note]     - Optional rider-provided note
 */
export const terminateOrder = async (orderId, riderId, note = "") => {
    const { TERMINATION_STRIKE_LIMIT, SUSPENSION_DURATION_MS } = await import("../config/payouts.js");

    let vendorOrder = await VendorOrder.findById(orderId).populate("userOrderId");
    let order = vendorOrder?.userOrderId;
    if (!order) order = await Order.findById(orderId).populate("userOrderId");
    if (!order) throw new Error("Order not found");

    const isAssigned =
        order.riderId?.toString() === riderId ||
        vendorOrder?.riderId?.toString() === riderId;
    if (!isAssigned) throw new Error("You are not assigned to this order");

    if (["delivered","cancelled"].includes(order.orderStatus)) {
        throw new Error("Cannot terminate a completed or cancelled order");
    }

    const foodPickedUp = ["out_for_delivery","picked_up"].includes(order.orderStatus);
    const rider = await Rider.findById(riderId).select("name phone terminationStrikes");

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        // 1. Reset order
        await Order.findByIdAndUpdate(order._id, {
            $set: {
                orderStatus: "ready_for_pickup",
                riderId: null,
                "riderAssignment.status": "unassigned",
                "riderAssignment.lastReason": "rider_terminated",
            },
            $push: { statusLog: { status:"ready_for_pickup", changedBy:`rider:${riderId}:terminated`, timestamp:new Date() } },
        }, { session });

        // 2. Reset vendor order
        if (vendorOrder) {
            await VendorOrder.findByIdAndUpdate(vendorOrder._id,
                { $set: { orderStatus:"ready_for_pickup", riderId:null } },
                { session }
            );
        }

        // 3. Free rider
        await Rider.findByIdAndUpdate(riderId, {
            $set: { status:"available", currentOrderId:null, assignmentExpiresAt:null },
        }, { session });

        // 4. Mark old assignment terminated
        await RiderAssignment.findOneAndUpdate(
            { riderId, orderId: order._id, status: { $in: ["assigned","accepted","picked_up"] } },
            { $set: { status:"terminated_by_rider", respondedAt:new Date(), reason:"rider_terminated" } },
            { session, sort: { createdAt: -1 } }
        );

        // 5. Create termination record
        await OrderTermination.create([{
            orderId:            order._id,
            vendorOrderId:      vendorOrder?._id || order._id,
            previousRiderId:    riderId,
            previousRiderName:  rider?.name  || "Unknown",
            previousRiderPhone: rider?.phone || "Unknown",
            foodPickedUp,
            reason:  "rider_initiated",
            riderNote: note,
            status:  "pending",
        }], { session });

        // 6. Apply strike only if food was already picked up
        if (foodPickedUp) {
            const updatedRider = await Rider.findByIdAndUpdate(riderId, {
                $inc: { terminationStrikes: 1 },
                $set: { lastTerminationAt: new Date() },
            }, { session, new: true });

            if (updatedRider.terminationStrikes >= TERMINATION_STRIKE_LIMIT) {
                await Rider.findByIdAndUpdate(riderId, {
                    $set: {
                        isSuspended:    true,
                        suspendedUntil: new Date(Date.now() + SUSPENSION_DURATION_MS),
                        status:         "offline",
                    },
                }, { session });
                logger.warn({ riderId }, "🚫 Rider suspended after post-pickup termination strike");
            }
        }

        // 7. Cancel the watchdog job (non-fatal — it will self-resolve if it fires)
        try {
            const job = await deliveryWatchdogQueue.getJob(`watchdog:${vendorOrder?._id || orderId}`);
            if (job) await job.remove();
        } catch (e) { logger.warn({ error: e.message }, "Could not cancel watchdog job (non-fatal)"); }

        await session.commitTransaction();
    } catch (err) {
        if (session.inTransaction()) await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }

    // 8. Notify customer (non-fatal)
    try {
        const { sendNotification } = await import("./notification.service.js");
        await sendNotification(order.userId, "rider_terminated_reassigning", {
            orderId: order.orderId,
            message: "Your rider had an issue. We are finding a replacement.",
        }, "user");
    } catch (e) { logger.warn({ error: e.message }, "Termination customer notify failed (non-fatal)"); }

    // 9. Re-broadcast (non-fatal)
    try {
        const vendorOrderId = vendorOrder?._id || orderId;
        await offerOrderToAvailableRiders({ vendorOrderId, assignedBy: "system:rider_termination" });
    } catch (e) {
        logger.error({ orderId: order._id, error: e.message }, "❌ Re-broadcast after termination failed");
    }

    return {
        success: true,
        foodPickedUp,
        message: foodPickedUp
            ? "Order terminated. A strike has been logged. New rider will contact you to collect the food."
            : "Order terminated. A new rider will be assigned shortly.",
    };
};

/**
 * Flag an order as undeliverable, trigger vendor remake window, or schedule admin escalation.
 *
 * @param {string} orderId    - VendorOrder _id or Order _id
 * @param {string} riderId    - Rider _id
 * @param {string} [reason]   - Optional reason details
 */
export const reportUndeliverable = async (orderId, riderId, reason = "") => {
    const { VENDOR_REMAKE_WINDOW_MS } = await import("../config/payouts.js");

    let vendorOrder = await VendorOrder.findById(orderId).populate("userOrderId");
    const order = vendorOrder?.userOrderId;
    if (!order) throw new Error("Order not found");

    const isAssigned =
        order.riderId?.toString() === riderId ||
        vendorOrder?.riderId?.toString() === riderId;
    if (!isAssigned) throw new Error("You are not assigned to this order");

    // Update order to disputed state
    await Order.findByIdAndUpdate(order._id, {
        $set: { orderStatus: "disputed_delivery" },
        $push: { statusLog: {
            status: "disputed_delivery",
            changedBy: `rider:${riderId}`,
            timestamp: new Date(),
        }},
    });

    // Update termination record to disputed
    await OrderTermination.findOneAndUpdate(
        { orderId: order._id, status: "pending" },
        { $set: { status: "disputed" } },
        { sort: { terminatedAt: -1 } }
    );

    // Notify vendor — can they remake?
    // Vendor has 15 minutes to respond via their app.
    // If no response, escalate to admin automatically.
    try {
        const { sendNotification } = await import("./notification.service.js");
        await sendNotification(vendorOrder.restaurantId, "order_remake_request", {
            orderId:      order.orderId,
            orderDbId:    order._id,
            reason:       reason || "Previous rider could not deliver",
            message:      "Can you remake this order? Respond YES within 15 minutes.",
            remakeWindow: VENDOR_REMAKE_WINDOW_MS,
        }, "vendor");
    } catch (e) {
        logger.warn({ error: e.message }, "Vendor remake notify failed");
    }

    // Schedule admin escalation if vendor does not respond
    try {
        await disputeEscalationQueue.add(
            "escalate-dispute",
            { orderId: order._id.toString(), vendorOrderId: vendorOrder._id.toString() },
            {
                jobId:            `dispute-escalation:${order._id}`,
                delay:            VENDOR_REMAKE_WINDOW_MS,
                attempts:         2,
                removeOnComplete: true,
                removeOnFail:     false,
            }
        );
    } catch (e) {
        logger.error({ error: e.message }, "❌ Dispute escalation queue failed");
    }

    return { success: true, message: "Order flagged as disputed. Vendor has been notified." };
};
