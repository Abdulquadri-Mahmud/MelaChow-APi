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
            // We don't block rider creation, but they won't be able to withdraw until they re-save bank details
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
 * The frontend calls GET /riders/:riderId/active-order but this function
 * did not exist — causing a permanent 404 and making activeOrder always null.
 */
export const getActiveOrder = async (riderId) => {
    const rider = await Rider.findById(riderId);
    if (!rider) throw new Error("Rider not found");

    let activeOrderId = rider.currentOrderId;

    if (!activeOrderId && rider.status === "pending_assignment") {
        const pendingAssignment = await RiderAssignment.findOne({
            riderId,
            status: "assigned",
            expiresAt: { $gt: new Date() },
        }).sort({ createdAt: -1 });
        activeOrderId = pendingAssignment?.orderId || null;
    }

    // No active order assigned
    if (!activeOrderId) return null;

    const order = await Order.findById(activeOrderId)
        .populate({ path: "items.restaurantId", select: "storeName address phone location coords" })
        .populate("userId", "firstname lastname name fullName phone email");

    if (!order) {
        // Order was deleted or currentOrderId is stale — clean it up
        if (rider.currentOrderId) {
            rider.currentOrderId = null;
            await rider.save();
        }
        return null;
    }

    // Enrich with a simplified status so the dashboard can show the right CTA
    const orderObj = order.toObject();
    if (rider.status === "pending_assignment") {
        orderObj.status = "assigned";
    } else if (rider.status === "on_delivery" || order.orderStatus === "out_for_delivery") {
        orderObj.status = "out_for_delivery";
    } else {
        orderObj.status = order.orderStatus;
    }
    const firstRestaurant = order.items?.[0]?.restaurantId;
    orderObj.restaurantId = firstRestaurant || order.vendorId || null;
    orderObj.restaurantName = firstRestaurant?.storeName || null;

    // Customer Name resolution
    const user = order.userId;
    orderObj.userName = user?.fullName || (user ? `${user.firstname || ""} ${user.lastname || ""}`.trim() : null) || "Customer";
    orderObj.userPhone = user?.phone || order.phone || null;

    // Address resolution for Rider (Full String)
    const addr = order.deliveryAddress;
    orderObj.deliveryFullAddress = addr?.address || addr?.addressLine || (addr ? `${addr.addressLine || ""}, ${addr.cityName || addr.city || ""}`.trim() : null);

    return orderObj;
};

/**
 * Assign a rider to an order
 */
export const assignRiderToOrder = async (orderId, riderId, vendorId) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const order = await Order.findById(orderId).session(session);
        if (!order) throw new Error("Order not found");
        const vendorOrderExists = await VendorOrder.exists({ userOrderId: order._id, restaurantId: vendorId });
        if (!vendorOrderExists) throw new Error("Order does not belong to this vendor");
        if (order.orderStatus !== "preparing" && order.orderStatus !== "ready_for_pickup") {
            throw new Error("Order is not ready for delivery assignment");
        }

        const rider = await Rider.findById(riderId).session(session);
        if (!rider) throw new Error("Rider not found");
        if (!rider.vendorId || rider.vendorId.toString() !== vendorId) throw new Error("Rider does not belong to this vendor");
        if (!rider.isVerified) throw new Error("Rider must be approved before assignment");
        
        // Only enforce 'available' status check for platform-managed riders.
        // For vendor-managed riders, we allow assignment regardless of status per user requirement.
        if (rider.managedBy === 'admin' && rider.status !== "available") {
            throw new Error("Rider is not available");
        }

        order.orderStatus = "rider_assigned";
        order.riderId = riderId;
        order.statusLog.push({
            status: "rider_assigned",
            changedBy: "vendor",
            timestamp: new Date()
        });
        await order.save({ session });

        const vendorOrder = await VendorOrder.findOneAndUpdate(
            { userOrderId: order._id, restaurantId: vendorId },
            { orderStatus: "rider_assigned" },
            { session, new: true }
        );

        await Rider.findByIdAndUpdate(
            riderId,
            { status: "pending_assignment", currentOrderId: orderId, assignmentExpiresAt: new Date(Date.now() + 5 * 60 * 1000) },
            { session }
        );

        await session.commitTransaction();
        const updatedRider = await Rider.findById(riderId);

        // 🔔 Send Rider Notification (Vendor-managed flow)
        try {
            const { sendRiderNotification } = await import('../services/notification.service.js');
            await sendRiderNotification(riderId, order._id, "order_assigned", {
                restaurantName: order.storeName || "a restaurant",
                orderDatabaseId: order._id,
                payout: 600
            });
            console.log(`✅ Push: Order assigned notification sent to rider:${riderId}`);
        } catch (e) { console.error('⚠️ Notification error (rider):', e.message); }

        return { order, vendorOrder, rider: updatedRider };
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
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");
    if (order.riderId?.toString() !== riderId) throw new Error("Rider not assigned to this order");

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

    // updateMany keyed on userOrderId only — works for both admin-managed riders
    // (vendorId: null) and vendor-managed riders. Single-vendor enforcement means
    // this updates exactly one VendorOrder in practice.
    await VendorOrder.updateMany(
        { userOrderId: order._id },
        { $set: { orderStatus: "out_for_delivery" } }
    );

    // Move rider to on_delivery
    await Rider.findByIdAndUpdate(riderId, { status: "on_delivery" });
    await RiderAssignment.findOneAndUpdate(
        { riderId, orderId: order._id, status: { $in: ["assigned", "accepted"] } },
        { $set: { status: "picked_up", respondedAt: new Date() } },
        { sort: { createdAt: -1 } }
    );

    // Notification handled in controller — service is data-only

    return order;
};

/**
 * Mark order as delivered by rider
 */
export const markDelivered = async (orderId, riderId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    let completedOrder = null;
    let riderVendorIdForEscrow = null;
    let pendingRiderPayout = null; // ← captures payout data for post-transaction execution
    let payoutActuallyCredited = false; // ← tracks whether wallet credit actually landed

    try {
        const order = await Order.findById(orderId).session(session);
        if (!order) throw new Error("Order not found");
        if (order.riderId?.toString() !== riderId) throw new Error("Rider not assigned to this order");

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

        // updateMany keyed on userOrderId only — works for admin-managed riders
        // whose vendorId is null. Session passed for transaction atomicity.
        await VendorOrder.updateMany(
            { userOrderId: order._id },
            { $set: { orderStatus: "delivered" } },
            { session }
        );

        const riderVendorId = rider.vendorId?.toString();
        const isAdminRider = rider.managedBy === 'admin';

        // ── CALCULATE DELIVERY FEE SOURCE ──────────────────────────────────────────
        // Admin riders are not tied to a specific vendor, so they get the TOTAL order 
        // delivery fee. Vendor riders get only the fee from their specific restaurant.
        let deliveryFee = 0;
        if (isAdminRider) {
            deliveryFee = Number(order.deliveryFee || 0);
            
            // ✅ PROMO FIX: If delivery fee is 0, use the original fee from the promo snapshot
            if (deliveryFee === 0) {
                deliveryFee = (order.freeDeliveryPromo?.originalDeliveryFee || 
                              order.vendorDeliveryPromo?.originalDeliveryFee || 0);
            }
            console.log(`👤 Admin-managed rider ${riderId}: using total order delivery fee ₦${deliveryFee}`);
        } else {
            const deliveryFeeEntry = order.vendorDeliveryFees?.find(
                v => v.restaurantId?.toString() === riderVendorId
            );
            deliveryFee = Number(deliveryFeeEntry?.deliveryFee || 0);
            
            // ✅ PROMO FIX: If vendor delivery fee is 0, check if a promo covered it.
            if (deliveryFee === 0) {
                const vendorPromo = order.vendorDeliveryPromo;
                if (vendorPromo?.applied && String(vendorPromo.vendorId) === riderVendorId) {
                    deliveryFee = vendorPromo.originalDeliveryFee;
                } else if (order.freeDeliveryPromo?.eligible) {
                    deliveryFee = order.freeDeliveryPromo.originalDeliveryFee;
                }
            }
            console.log(`🚲 Vendor-managed rider ${riderId}: using vendor delivery fee ₦${deliveryFee}`);
        }

        let riderEarningsToRecord = 0;

        if (deliveryFee > 0) {
            // All deliveries are platform-managed — always use the spread model.
            // Rider receives fixed payout; platform retains the spread.
            const platformConfig = await getPlatformConfig();
            const RIDER_FIXED_PAYOUT = platformConfig.riderFixedPayout;

            const riderPayout = Math.min(RIDER_FIXED_PAYOUT, deliveryFee);
            const platformSpread = Number((deliveryFee - riderPayout).toFixed(2));

            // Stage payout for post-transaction execution to prevent escrow deadlocks
            pendingRiderPayout = {
                riderId,
                riderPayout,
                platformSpread,
                orderId: order.orderId,
                orderDbId: order._id,
                RIDER_FIXED_PAYOUT,
            };

            riderEarningsToRecord = riderPayout;
            console.log(`📦 Rider payout staged post-transaction — ₦${riderPayout} for Order ${order.orderId}`);
        }

        // Persist the rider's actual payout on the order document.
        // This is what the order history card reads — never the customer delivery fee.
        order.riderEarnings = riderEarningsToRecord;
        await order.save({ session });

        await rider.freeUp(riderEarningsToRecord);
        rider.assignmentExpiresAt = null;
        await rider.save({ session });
        await RiderAssignment.findOneAndUpdate(
            { riderId, orderId: order._id, status: { $in: ["assigned", "accepted", "picked_up"] } },
            { $set: { status: "delivered", respondedAt: new Date() } },
            { session, sort: { createdAt: -1 } }
        );
        await session.commitTransaction();

        // Capture values needed after session closes
        completedOrder = order;

    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();  // ← only ONE call, always in finally
    }

    // ── Post-transaction: rider wallet payout ─────────────────────────────────
    // Runs after the delivery status transaction commits successfully.
    // Failure here does NOT reverse the delivery — order remains "delivered".
    // Failed payouts are logged for manual review and queued for retry.
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
                // Non-fatal — log for manual top-up, do not throw
                logger.error(
                    { orderId: readableOrderId, riderPayout, adminBalance: adminWallet.balance },
                    '⚠️ Admin wallet insufficient for rider payout — queued for manual review'
                );

                // 🚨 Real-time Admin Alert for insufficient funds
                try {
                    const { sendNotification } = await import('../services/notification.service.js');
                    await sendNotification(null, 'admin_insufficient_funds', {
                        adminBalance: adminWallet.balance,
                        riderPayout,
                        orderId: readableOrderId,
                        orderDatabaseId: orderDbId
                    }, 'admin');
                } catch (notifErr) { logger.error('❌ Admin notification for payout failure failed', notifErr.message); }

                // TODO: push to a riderPayoutRetryQueue when implemented
            } else {
                // Debit rider payout from admin wallet
                adminWallet.balance = Number((adminWallet.balance - riderPayout).toFixed(2));
                adminWallet.transactions.push({
                    type: "debit",
                    amount: riderPayout,
                    description: `Rider payout (fixed ₦${RIDER_FIXED_PAYOUT}) for Order ${readableOrderId}`,
                    transactionType: 'rider_payout',
                });

                // Record spread — informational, amount: 0 to avoid ledger inflation
                adminWallet.transactions.push({
                    type: "debit",
                    amount: 0,             // Balance-neutral — real flow already in delivery_fee credit + rider_payout debit
                    reportingAmount: platformSpread,   // ← Actual spread value for finance reporting
                    description: `Delivery spread retained for Order ${readableOrderId} — reporting only`,
                    transactionType: 'delivery_spread',
                });

                await adminWallet.save();

                // Credit rider wallet
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

                payoutActuallyCredited = true; // ← wallet credit confirmed
                console.log(`💰 Spread model — ₦${riderPayout} (Rider) | ₦${platformSpread} (Platform spread) for Order ${readableOrderId}`);
            }
        } catch (payoutErr) {
            // Non-fatal — delivery already confirmed, payout logged for manual review
            logger.error(
                { orderId: completedOrder.orderId, error: payoutErr.message },
                '❌ Post-transaction rider payout failed — manual review required'
            );
        }
    }

    // ── Post-transaction: escrow release for ALL vendors in the order ──
    // Loops VendorOrder documents so escrow releases correctly whether the
    // rider is admin-managed (no vendorId) or vendor-managed (has vendorId).
    // Single-vendor enforcement in createOrderV2 means this loop runs once
    // in practice — but the loop makes it structurally correct regardless.
    if (completedOrder) {
        const allVendorOrders = await VendorOrder.find({
            userOrderId: completedOrder._id
        });

        for (const vo of allVendorOrders) {
            try {
                await releaseEscrowToVendor(vo._id);
            } catch (escrowErr) {
                logger.error(
                    { orderId: completedOrder._id, vendorOrderId: vo._id, error: escrowErr.message },
                    '❌ Escrow release failed — adding to retry queue'
                );
                await escrowReleaseQueue.add(
                    'retry-escrow',
                    { vendorOrderId: vo._id.toString() },
                    { jobId: `escrow-${vo._id}` }
                );
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
export const updateRiderStatus = async (riderId, status) => {
    const rider = await Rider.findById(riderId);
    if (!rider) throw new Error("Rider not found");

    if (!["available", "offline", "on_delivery"].includes(status)) {
        throw new Error("Invalid status update");
    }

    if (!rider.isVerified && status === "available") {
        throw new Error("Your rider account is pending admin approval");
    }

    if (rider.currentOrderId && status === "offline") {
        throw new Error("Cannot go offline while assigned to an order");
    }

    if (status === "on_delivery") {
        if (rider.status !== "pending_assignment") {
            throw new Error("You can only transition to on_delivery from pending_assignment");
        }
    }

    if (status === "available" && rider.status === "pending_assignment") {
        await RiderAssignment.findOneAndUpdate(
            { riderId, orderId: rider.currentOrderId, status: "assigned" },
            { $set: { status: "rejected", respondedAt: new Date(), reason: "rider_released_assignment" } }
        );
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
    const finalUpdate = {};
    allowedUpdates.forEach(key => {
        if (updateData[key] !== undefined) {
            finalUpdate[key] = updateData[key];
        }
    });

    Object.assign(rider, finalUpdate);
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
    const finalUpdate = {};
    
    allowedUpdates.forEach(key => {
        if (updateData[key] !== undefined) {
            finalUpdate[key] = updateData[key];
        }
    });

    if (updateData.password) {
        rider.password = updateData.password;
    }

    Object.assign(rider, finalUpdate);
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
    
    // Support filtering for available riders (for assignment modals)
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
        "vendorId", "status", "stateId", "cityId", "serviceZones", "vehicleOwnership", "vehicleType", "platformVehicleId", "isVerified"
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

    // Handle payoutDetails update and recipient regeneration
    if (updateData.payoutDetails) {
        const currentPayout = rider.payoutDetails || {};
        const newPayout = updateData.payoutDetails;

        // If bank info changed, regenerate recipient
        const bankChanged = 
            newPayout.accountNumber !== currentPayout.accountNumber || 
            newPayout.bankCode !== currentPayout.bankCode;

        if (bankChanged && newPayout.accountNumber && newPayout.bankCode && newPayout.accountName) {
            try {
                const recipientCode = await createTransferRecipient({
                    name: newPayout.accountName,
                    accountNumber: newPayout.accountNumber,
                    bankCode: newPayout.bankCode
                });
                newPayout.recipientCode = recipientCode;
                newPayout.payoutEnabled = true;
                console.log(`✅ Paystack recipient regenerated for rider ${riderId}: ${recipientCode}`);
            } catch (err) {
                console.error("⚠️ Failed to regenerate Paystack recipient during admin rider update:", err.message);
            }
        }

        rider.payoutDetails = {
            ...currentPayout,
            ...newPayout
        };
    }

    await rider.save();
    const savedVehicleId = rider.platformVehicleId?.toString() || null;
    if (previousVehicleId && previousVehicleId !== savedVehicleId) {
        await PlatformVehicle.findByIdAndUpdate(previousVehicleId, {
            status: "available",
            assignedRiderId: null,
        });
    }
    if (savedVehicleId) {
        await PlatformVehicle.findByIdAndUpdate(savedVehicleId, {
            status: "assigned",
            assignedRiderId: rider._id,
        });
    }
    return rider.getPublicProfile();
};

export const adminApproveRider = async (riderId, adminId) => {
    const rider = await Rider.findById(riderId);
    if (!rider) throw new Error("Rider not found");
    if (!rider.isActive || rider.deletedAt) throw new Error("Cannot approve an inactive rider");
    if (!rider.cityId || !rider.stateId) throw new Error("Assign the rider's state and city before approval");

    rider.isVerified = true;
    rider.approvedAt = new Date();
    rider.approvedBy = adminId || null;
    if (rider.status === "available" && rider.currentOrderId) {
        rider.status = "offline";
    }
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

/**
 * Admin: Deactivate any rider
 */
export const adminDeactivateRider = async (riderId) => {
    const rider = await Rider.findById(riderId);
    if (!rider) throw new Error("Rider not found");

    if (rider.currentOrderId) {
        throw new Error("Cannot deactivate rider mid-delivery");
    }

    rider.isActive = false;
    rider.deletedAt = new Date();
    return rider.save();
};

/**
 * Get rider wallet balance and transaction history
 */
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
