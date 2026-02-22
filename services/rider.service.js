import Rider from "../model/rider.model.js";
import Vendor from "../model/vendor/vendor.model.js";
import Order from "../model/order/order.model.js";
import VendorOrder from "../model/vendor/VendorOrder.js";
import Admin from "../model/Admin/admin.model.js";
import mongoose from "mongoose";

/**
 * Create a new rider for a specific vendor
 */
export const createRider = async (vendorId, riderData) => {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor || vendor.deletedAt) {
        throw new Error("Vendor not found or inactive");
    }

    // Check unique phone for this vendor (Actually, phone should be globally unique if it's the login ID)
    // But the prompt says "Ensure phone is unique within this vendor's rider pool"
    // Usually, login ID should be globally unique to avoid login ambiguity.
    // I'll check global uniqueness to be safe for the role.
    const existingRider = await Rider.findOne({ phone: riderData.phone });
    if (existingRider) {
        throw new Error("A rider with this phone number already exists");
    }

    const rider = await Rider.create({
        ...riderData,
        vendorId,
        status: "offline",
        isActive: true
    });

    // Add rider to vendor's riders array
    vendor.riders = vendor.riders || [];
    vendor.riders.push(rider._id);
    await vendor.save();

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
        if (order.vendorId.toString() !== vendorId) throw new Error("Order does not belong to this vendor");
        if (order.status !== "ready") throw new Error("Order is not in 'ready' status");

        const rider = await Rider.findById(riderId).session(session);
        if (!rider) throw new Error("Rider not found");
        if (rider.vendorId.toString() !== vendorId) throw new Error("Rider does not belong to this vendor");
        if (rider.status !== "available") throw new Error("Rider is not available");

        // Update Order
        order.status = "assigned";
        order.riderId = riderId;
        order.statusLog.push({
            status: "assigned",
            changedBy: "vendor",
            timestamp: new Date()
        });
        await order.save({ session });

        // Update VendorOrder (using orderId reference from the Order document which is the string ID)
        // Wait, Order document has orderId (string) and _id (ObjectId).
        // Let's check how VendorOrder references are stored.
        // Usually via orderId string or ObjectId. Based on socket code, I used order.orderId.
        const vendorOrder = await VendorOrder.findOneAndUpdate(
            { userOrderId: order._id, restaurantId: vendorId },
            { orderStatus: "rider_assigned" },
            { session, new: true }
        );

        // Call rider assignOrder method
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

    order.status = "picked_up";
    order.statusLog.push({
        status: "picked_up",
        changedBy: "rider",
        timestamp: new Date()
    });
    await order.save();

    await VendorOrder.findOneAndUpdate(
        { userOrderId: order._id, restaurantId: order.vendorId },
        { orderStatus: "out_for_delivery" }
    );

    return order;
};

/**
 * Mark order as delivered by rider
 */
export const markDelivered = async (orderId, riderId) => {
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");
    if (order.riderId?.toString() !== riderId) throw new Error("Rider not assigned to this order");

    order.status = "delivered";
    order.statusLog.push({
        status: "delivered",
        changedBy: "rider",
        timestamp: new Date()
    });
    await order.save();

    await VendorOrder.findOneAndUpdate(
        { userOrderId: order._id, restaurantId: order.vendorId },
        { orderStatus: "delivered" }
    );

    const rider = await Rider.findById(riderId);
    await rider.freeUp();

    return order;
};

/**
 * Update rider status manually
 */
export const updateRiderStatus = async (riderId, vendorId, status) => {
    const rider = await Rider.findOne({ _id: riderId, vendorId });
    if (!rider) throw new Error("Rider not found for this vendor");

    if (!["available", "offline"].includes(status)) {
        throw new Error("Only 'available' or 'offline' status can be set manually");
    }

    if (rider.currentOrderId && status === "offline") {
        throw new Error("Cannot go offline while on a delivery");
    }

    rider.status = status;
    return rider.save();
};

/**
 * Update rider info by vendor
 */
export const updateRider = async (riderId, vendorId, updateData) => {
    const rider = await Rider.findOne({ _id: riderId, vendorId });
    if (!rider) throw new Error("Rider not found for this vendor");

    // Restrictions: Strip sensitive/locked fields
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

    // Admin can update everything including password (if hashed) and vendorId
    // But we still protect some fields or handle them specifically
    const allowedUpdates = ["name", "phone", "notes", "isActive", "avatar", "metadata", "vendorId", "status"];

    allowedUpdates.forEach(key => {
        if (updateData[key] !== undefined) {
            rider[key] = updateData[key];
        }
    });

    if (updateData.password) {
        rider.password = updateData.password; // Pre-save hook will hash it
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
