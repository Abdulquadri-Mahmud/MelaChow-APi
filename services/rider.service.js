import Rider from "../model/rider.model.js";
import Vendor from "../model/vendor/vendor.model.js";
import Order from "../model/order/Order.js";
import VendorOrder from "../model/vendor/VendorOrder.js";
import Admin from "../model/Admin/admin.model.js";
import Wallet from "../model/wallet/wallet.mode.js";
import mongoose from "mongoose";

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

    // ── Auto-create wallet for rider ──────────────────────────────────────
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

    // Add rider to vendor's riders array if applicable
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

        rider.status = "on_delivery";
        rider.currentOrderId = orderId;
        await rider.save({ session });

        await session.commitTransaction();
        return { order, vendorOrder, rider };
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

    return order;
};

/**
 * Mark order as delivered by rider
 */
export const markDelivered = async (orderId, riderId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

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

        // Resolve delivery fee from order
        const deliveryFeeEntry = order.vendorDeliveryFees?.find(
            v => v.restaurantId?.toString() === riderVendorId
        );
        const deliveryFee = Number(deliveryFeeEntry?.deliveryFee || 0);

        if (deliveryFee > 0) {
            // Find or create rider wallet
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

            // Credit rider wallet
            riderWallet.balance = Number((riderWallet.balance + deliveryFee).toFixed(2));
            riderWallet.transactions.push({
                type: "credit",
                amount: deliveryFee,
                description: `Delivery fee from Order ${order.orderId}`,
                date: new Date()
            });
            await riderWallet.save({ session });

            // Determine who to debit based on delivery mode
            const vendor = riderVendorId
                ? await Vendor.findById(riderVendorId).session(session)
                : null;
            const deliveryManagedBy = vendor?.deliveryManagedBy || "admin";

            if (deliveryManagedBy === "vendor" && vendor) {
                // Debit vendor wallet
                const vendorWallet = await Wallet.findOne({
                    ownerId: riderVendorId,
                    ownerModel: "Vendor"
                }).session(session);

                if (vendorWallet) {
                    const safeDebit = Math.min(deliveryFee, vendorWallet.balance);
                    vendorWallet.balance = Number((vendorWallet.balance - safeDebit).toFixed(2));
                    vendorWallet.transactions.push({
                        type: "debit",
                        amount: safeDebit,
                        description: `Rider delivery payout for Order ${order.orderId}`,
                        date: new Date()
                    });
                    await vendorWallet.save({ session });
                    console.log(`💸 ₦${deliveryFee} transferred: Vendor ${riderVendorId} → Rider ${riderId}`);
                }
            } else {
                // Debit admin wallet
                const adminWallet = await Wallet.findOne({
                    ownerModel: "Admin"
                }).session(session);

                if (adminWallet) {
                    const safeDebit = Math.min(deliveryFee, adminWallet.balance);
                    adminWallet.balance = Number((adminWallet.balance - safeDebit).toFixed(2));
                    adminWallet.transactions.push({
                        type: "debit",
                        amount: safeDebit,
                        description: `Admin rider delivery payout for Order ${order.orderId}`,
                        date: new Date()
                    });
                    await adminWallet.save({ session });
                    console.log(`💸 ₦${deliveryFee} transferred: Admin → Rider ${riderId}`);
                }
            }
        }

        await rider.freeUp(deliveryFee);
        await session.commitTransaction();
        return order;

    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

/**
 * Update rider status manually (rider self-service)
 */
export const updateRiderStatus = async (riderId, status) => {
    const rider = await Rider.findById(riderId);
    if (!rider) throw new Error("Rider not found");

    if (!["available", "offline"].includes(status)) {
        throw new Error("Only 'available' or 'offline' status can be set manually");
    }

    if (rider.currentOrderId && status === "offline") {
        throw new Error("Cannot go offline while on a delivery");
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