import Rider from "../model/rider.model.js";
import Vendor from "../model/vendor/vendor.model.js";
import Order from "../model/order/Order.js";
import VendorOrder from "../model/vendor/VendorOrder.js";
import Admin from "../model/Admin/admin.model.js";
import Wallet from "../model/wallet/wallet.mode.js";
import mongoose from "mongoose";
import { releaseEscrowToVendor } from '../controller/order/createOrderV2.controller.js';

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

    const rider = await Rider.create({
        ...riderData,
        vendorId: vendorId || null,
        managedBy: vendorId ? "vendor" : "admin",
        status: "offline",
        isActive: true
    });

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

    // No active order assigned
    if (!rider.currentOrderId) return null;

    const order = await Order.findById(rider.currentOrderId)
        .populate({ path: "items.restaurantId", select: "storeName address phone location coords" })
        .populate("userId", "firstname lastname name fullName phone email");

    if (!order) {
        // Order was deleted or currentOrderId is stale — clean it up
        rider.currentOrderId = null;
        await rider.save();
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
        if (rider.status !== "available") throw new Error("Rider is not available");

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
            { status: "pending_assignment", currentOrderId: orderId },
            { session }
        );

        await session.commitTransaction();
        const updatedRider = await Rider.findById(riderId);
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
    order.statusLog.push({
        status: "out_for_delivery",
        changedBy: "rider",
        timestamp: new Date()
    });
    await order.save();

    await VendorOrder.findOneAndUpdate(
        { userOrderId: order._id, restaurantId: rider.vendorId },
        { orderStatus: "out_for_delivery" }
    );

    // Move rider to on_delivery
    await Rider.findByIdAndUpdate(riderId, { status: "on_delivery" });

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

    try {
        const order = await Order.findById(orderId).session(session);
        if (!order) throw new Error("Order not found");
        if (order.riderId?.toString() !== riderId) throw new Error("Rider not assigned to this order");

        const rider = await Rider.findById(riderId).session(session);
        if (!rider) throw new Error("Rider not found");

        order.orderStatus = "delivered";
        order.statusLog.push({
            status: "delivered",
            changedBy: "rider",
            timestamp: new Date()
        });
        await order.save({ session });

        await VendorOrder.findOneAndUpdate(
            { userOrderId: order._id, restaurantId: rider.vendorId },
            { orderStatus: "delivered" },
            { session }
        );

        const riderVendorId = rider.vendorId?.toString();

        const deliveryFeeEntry = order.vendorDeliveryFees?.find(
            v => v.restaurantId?.toString() === riderVendorId
        );
        const deliveryFee = Number(deliveryFeeEntry?.deliveryFee || 0);
        let riderEarningsToRecord = 0;

        if (deliveryFee > 0) {
            let riderWallet = await Wallet.findOne({
                ownerId: riderId,
                ownerModel: "Rider"
            }).session(session);

            if (!riderWallet) {
                [riderWallet] = await Wallet.create(
                    [{ ownerId: riderId, ownerModel: "Rider", balance: 0, transactions: [] }],
                    { session }
                );
            }

            const vendor = riderVendorId
                ? await Vendor.findById(riderVendorId).session(session)
                : null;

            const deliveryManagedBy = vendor?.deliveryManagedBy || "vendor";

            if (deliveryManagedBy === "vendor") {
                // ── PHASE 1: VENDOR-MANAGED DELIVERY ──────────────────────────────────
                // The vendor pays their rider directly in cash.
                // The delivery fee was already credited to the vendor wallet during
                // completeOrderFulfillment. 
                // We'll record 100% as earnings for stats, but no wallet movement.
                riderEarningsToRecord = deliveryFee;
                console.log(`💵 Vendor-managed delivery — rider paid by vendor. No wallet transaction.`);

            } else {
                // ── PLATFORM-MANAGED DELIVERY ─────────────────────────────────────────
                // GrubDash supplied the rider. 
                // COMMISSION SPLIT: Rider gets 80%, Platform (Admin) retains 20%.
                
                const riderPayout = Number((deliveryFee * 0.8).toFixed(2));
                const platformCommission = Number((deliveryFee * 0.2).toFixed(2));

                const adminWallet = await Wallet.findOne({ ownerModel: "Admin" }).session(session);
                if (!adminWallet) throw new Error("Admin wallet not found");

                // We only debit the rider's share from the admin wallet. 
                if (adminWallet.balance < riderPayout) {
                    throw new Error("Admin wallet has insufficient balance to pay rider");
                }

                adminWallet.balance = Number((adminWallet.balance - riderPayout).toFixed(2));
                adminWallet.transactions.push({
                    type: "debit",
                    amount: riderPayout,
                    description: `Rider Payout (80%) for Order ${order.orderId}`,
                    metadata: { deliveryFee, commission: platformCommission }
                });
                await adminWallet.save({ session });

                riderWallet.balance = Number((riderWallet.balance + riderPayout).toFixed(2));
                riderWallet.transactions.push({
                    type: "credit",
                    amount: riderPayout,
                    description: `Delivery Fee (80% share) for Order ${order.orderId}`,
                    metadata: { totalFee: deliveryFee }
                });
                await riderWallet.save({ session });

                riderEarningsToRecord = riderPayout;
                console.log(`💰 Split payout — ₦${riderPayout} (Rider) | ₦${platformCommission} (Commission) for Order ${order.orderId}`);
            }
        }

        await rider.freeUp(riderEarningsToRecord);
        await session.commitTransaction();

        // Capture values needed after session closes
        completedOrder = order;
        riderVendorIdForEscrow = rider.vendorId;

    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();  // ← only ONE call, always in finally
    }

    // ── Post-transaction: escrow release in its own session ──
    if (completedOrder && riderVendorIdForEscrow) {
        const vendorOrder = await VendorOrder.findOne({
            userOrderId: completedOrder._id,
            restaurantId: riderVendorIdForEscrow
        });
        if (vendorOrder) {
            try {
                await releaseEscrowToVendor(vendorOrder._id);
            } catch (escrowErr) {
                console.error(`❌ Escrow release failed after delivery for order ${completedOrder._id}:`, escrowErr.message);
                // TODO: Add to retry queue when BullMQ is implemented
            }
        }
    }

    return completedOrder;
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

    if (rider.currentOrderId && status === "offline") {
        throw new Error("Cannot go offline while assigned to an order");
    }

    if (status === "on_delivery") {
        if (rider.status !== "pending_assignment") {
            throw new Error("You can only transition to on_delivery from pending_assignment");
        }
    }

    if (status === "available" && rider.status === "pending_assignment") {
        rider.currentOrderId = null;
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
    return rider.save();
};

/**
 * Admin: Get all riders in the system
 */
export const getAllRiders = async (filters = {}) => {
    const query = { deletedAt: null };
    if (filters.status) query.status = filters.status;
    if (filters.vendorId) query.vendorId = filters.vendorId;
    if (filters.isActive !== undefined) query.isActive = filters.isActive;
    
    // Support filtering for available riders (for assignment modals)
    if (filters.available === 'true' || filters.available === true) {
        query.status = 'available';
        query.isActive = true;
    }

    return Rider.find(query).populate("vendorId", "storeName email phone");
};

/**
 * Admin: Update any rider
 */
export const adminUpdateRider = async (riderId, updateData) => {
    const rider = await Rider.findById(riderId);
    if (!rider) throw new Error("Rider not found");

    const allowedUpdates = ["name", "phone", "notes", "isActive", "avatar", "metadata", "vendorId", "status"];
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