import * as riderService from "../services/rider.service.js";
import { SOCKET_EVENTS, SOCKET_ROOMS, buildPayload } from "../socket/rider.events.js";
import { getIO } from "../socket/socketServer.js";
import Notification from "../model/notification/notification.model.js";
import Order from "../model/order/Order.js";

export const createRider = async (req, res, next) => {
    try {
        const { vendorId } = req.params;
        const rider = await riderService.createRider(req.body, vendorId);
        res.status(201).json({ success: true, data: rider.getPublicProfile() });
    } catch (error) {
        next(error);
    }
};

export const getVendorRiders = async (req, res, next) => {
    try {
        const { vendorId } = req.params;
        const { status } = req.query;
        const riders = await riderService.getRidersByVendor(vendorId, { status });
        res.status(200).json({ success: true, count: riders.length, data: riders });
    } catch (error) {
        next(error);
    }
};

export const getSingleVendorRider = async (req, res, next) => {
    try {
        const { vendorId, riderId } = req.params;
        const rider = await riderService.getSingleRiderForVendor(riderId, vendorId);
        res.status(200).json({ success: true, data: rider });
    } catch (error) {
        next(error);
    }
};

export const getAvailableRiders = async (req, res, next) => {
    try {
        const { vendorId } = req.params;
        const riders = await riderService.getAvailableRiders(vendorId);
        res.status(200).json({ success: true, count: riders.length, data: riders });
    } catch (error) {
        next(error);
    }
};

export const assignRider = async (req, res, next) => {
    try {
        const { vendorId, orderId } = req.params;
        const { riderId } = req.body;

        const { order, rider } = await riderService.assignRiderToOrder(orderId, riderId, vendorId);

        const io = getIO(req);

        // Notify rider
        io.to(SOCKET_ROOMS.rider(riderId)).emit(
            SOCKET_EVENTS.ORDER_ASSIGNED_TO_RIDER,
            buildPayload.orderAssigned({
                orderId: order._id,
                vendorId,
                vendorName: req.vendor.storeName,
                items: order.items,
                deliveryAddress: order.deliveryAddress,
                customerName: order.deliveryAddress.name || "Customer", // Fallback
                customerPhone: order.deliveryAddress.phone,
                note: order.note
            })
        );

        // Notify customer
        io.to(SOCKET_ROOMS.customer(order.userId)).emit(
            SOCKET_EVENTS.ORDER_STATUS_UPDATE,
            buildPayload.statusUpdate({
                orderId: order._id,
                status: "assigned",
                changedBy: "vendor",
                message: `Rider ${rider.name} has been assigned to your order`,
                riderName: rider.name
            })
        );

        // --- NEW: Create Notification in DB for Rider ---
        try {
            await Notification.create({
                riderId: rider._id,
                title: "New Delivery Assigned",
                body: `You have been assigned an order from ${req.vendor.storeName}.`,
                type: "order_assigned",
                orderId: order._id,
                restaurantId: vendorId,
                data: {
                    deliveryAddress: order.deliveryAddress,
                }
            });
        } catch (notifErr) {
            console.warn('⚠️ Failed to create rider notification in DB:', notifErr.message);
        }

        res.status(200).json({ success: true, message: "Rider assigned successfully", data: { order, rider } });
    } catch (error) {
        next(error);
    }
};

export const getRiderOrderDetails = async (req, res, next) => {
    try {
        const { riderId, orderId } = req.params;

        if (req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Unauthorized to view this order" });
        }

        const order = await Order.findById(orderId)
            .populate("restaurantId", "storeName address phone location coords")
            .populate("userId", "name phone email");

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        if (order.riderId?.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Rider not assigned to this order" });
        }

        res.status(200).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
};

export const updateRiderStatus = async (req, res, next) => {
    try {
        const { riderId } = req.params;
        const { status } = req.body;

        // Fetch old state before updating
        const oldRider = await riderService.getSingleRiderForVendor(riderId, req.rider?.vendorId || "dummy");
        const wasPending = oldRider.status === "pending_assignment";
        const orderId = oldRider.currentOrderId?._id || oldRider.currentOrderId;

        const rider = await riderService.updateRiderStatus(riderId, status);
        const vendorId = rider.vendorId?.toString();

        let io;
        try {
            io = getIO();
        } catch (err) {
            console.warn("Socket.IO not initialized during rider status update", err.message);
        }

        if (wasPending && orderId && io) {
            if (status === "on_delivery") {
                // Rider Accepted the Order
                if (vendorId) {
                    io.to(SOCKET_ROOMS.vendor(vendorId)).emit(
                        SOCKET_EVENTS.ORDER_STATUS_UPDATE,
                        buildPayload.statusUpdate({
                            orderId,
                            status: "rider_accepted",
                            changedBy: "rider",
                            message: `Rider ${rider.name} has accepted the delivery assignment.`,
                            riderName: rider.name
                        })
                    );
                }
            } else if (status === "available") {
                // Rider Rejected the Order
                const Order = (await import("../model/order/Order.js")).default;
                const VendorOrder = (await import("../model/vendor/VendorOrder.js")).default;

                const order = await Order.findByIdAndUpdate(
                    orderId,
                    {
                        orderStatus: "ready_for_pickup",
                        riderId: null, // Open it back up for reassignment
                        $push: {
                            statusLog: {
                                status: "rider_rejected",
                                changedBy: "rider",
                                timestamp: new Date()
                            }
                        }
                    },
                    { new: true }
                );

                if (order && vendorId) {
                    await VendorOrder.findOneAndUpdate(
                        { userOrderId: order._id, restaurantId: vendorId },
                        { orderStatus: "ready_for_pickup" }
                    );

                    io.to(SOCKET_ROOMS.vendor(vendorId)).emit(
                        SOCKET_EVENTS.ORDER_STATUS_UPDATE,
                        buildPayload.statusUpdate({
                            orderId,
                            status: "rider_rejected",
                            changedBy: "rider",
                            message: `Rider ${rider.name} rejected the assignment. Please assign another rider.`,
                            riderName: rider.name
                        })
                    );
                }
            }
        }

        if (io && vendorId) {
            try {
                io.to(SOCKET_ROOMS.vendor(vendorId)).emit(
                    SOCKET_EVENTS.RIDER_STATUS_CHANGED,
                    buildPayload.riderStatusChanged({
                        riderId: rider._id,
                        riderName: rider.name,
                        status: rider.status
                    })
                );
            } catch (socketErr) {
                console.warn('⚠️ Socket emit failed:', socketErr.message);
            }
        }

        res.status(200).json({ success: true, data: rider.getPublicProfile() });
    } catch (error) {
        next(error);
    }
};

export const markPickedUp = async (req, res, next) => {
    try {
        const { riderId } = req.params;
        const { orderId } = req.body;

        const order = await riderService.markPickedUp(orderId, riderId);

        try {
            const io = getIO();
            const payload = buildPayload.statusUpdate({
                orderId: order._id,
                status: "picked_up",
                changedBy: "rider",
                message: "Rider has picked up the order",
                riderName: req.rider.name
            });
            // vendorId must come from the rider — fetch it from req.rider
            io.to(SOCKET_ROOMS.vendor(req.rider?.vendorId)).emit(SOCKET_EVENTS.ORDER_STATUS_UPDATE, payload);
            io.to(SOCKET_ROOMS.customer(order.userId)).emit(SOCKET_EVENTS.ORDER_STATUS_UPDATE, payload);
        } catch (socketErr) {
            console.warn('⚠️ Socket emit failed:', socketErr.message);
        }

        res.status(200).json({ success: true, message: "Order picked up", data: order });
    } catch (error) {
        next(error);
    }
};

export const markDelivered = async (req, res, next) => {
    try {
        const { riderId } = req.params;
        const { orderId } = req.body;

        const order = await riderService.markDelivered(orderId, riderId);

        try {
            const io = getIO();
            const statusPayload = buildPayload.statusUpdate({
                orderId: order._id,
                status: "delivered",
                changedBy: "rider",
                message: "Order has been delivered",
                riderName: req.rider.name
            });
            const deliveredPayload = buildPayload.orderDelivered({
                orderId: order._id,
                riderName: req.rider.name
            });
            io.to(SOCKET_ROOMS.customer(order.userId)).emit(SOCKET_EVENTS.ORDER_DELIVERED, deliveredPayload);
            // vendorId must come from the rider — fetch it from req.rider
            io.to(SOCKET_ROOMS.vendor(req.rider?.vendorId)).emit(SOCKET_EVENTS.ORDER_STATUS_UPDATE, statusPayload);
        } catch (socketErr) {
            console.warn('⚠️ Socket emit failed:', socketErr.message);
        }

        res.status(200).json({ success: true, message: "Order delivered", data: order });
    } catch (error) {
        next(error);
    }
};

export const updateRider = async (req, res, next) => {
    try {
        const { vendorId, riderId } = req.params;
        const rider = await riderService.updateRider(riderId, vendorId, req.body);
        res.status(200).json({ success: true, data: rider });
    } catch (error) {
        next(error);
    }
};

export const deactivateRider = async (req, res, next) => {
    try {
        const { vendorId, riderId } = req.params;
        await riderService.deactivateRider(riderId, vendorId);
        res.status(200).json({ success: true, message: "Rider deactivated successfully" });
    } catch (error) {
        next(error);
    }
};

// --- Admin Controllers ---

export const adminGetAllRiders = async (req, res, next) => {
    try {
        const riders = await riderService.getAllRiders(req.query);
        res.status(200).json({ success: true, count: riders.length, data: riders });
    } catch (error) {
        next(error);
    }
};

export const adminUpdateRider = async (req, res, next) => {
    try {
        const { riderId } = req.params;
        const rider = await riderService.adminUpdateRider(riderId, req.body);
        res.status(200).json({ success: true, data: rider });
    } catch (error) {
        next(error);
    }
};

export const adminDeactivateRider = async (req, res, next) => {
    try {
        const { riderId } = req.params;
        await riderService.adminDeactivateRider(riderId);
        res.status(200).json({ success: true, message: "Rider deactivated successfully by admin" });
    } catch (error) {
        next(error);
    }
};

export const getRiderWallet = async (req, res, next) => {
    try {
        const { riderId } = req.params;
        const wallet = await riderService.getRiderWallet(riderId);
        res.status(200).json({ success: true, data: wallet });
    } catch (error) {
        next(error);
    }
};
