import * as riderService from "../services/rider.service.js";
import { SOCKET_EVENTS, SOCKET_ROOMS, buildPayload } from "../socket/rider.events.js";
import { getIO } from "../socket/socketServer.js";
import Notification from "../model/notification/notification.model.js";
import Order from "../model/order/Order.js";
import Rider from "../model/rider.model.js";

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

        // ✅ FIX: riderId is now included in the payload so the frontend
        // handleRiderAssigned guard (data.riderId === riderId) actually passes
        io.to(SOCKET_ROOMS.rider(riderId)).emit(
            SOCKET_EVENTS.ORDER_ASSIGNED_TO_RIDER,
            buildPayload.orderAssigned({
                orderId: order._id,
                riderId,                                   // ← was missing
                vendorId,
                vendorName: req.vendor.storeName,
                items: order.items,
                deliveryAddress: order.deliveryAddress,
                customerName: order.deliveryAddress?.name || "Customer",
                customerPhone: order.deliveryAddress?.phone,
                note: order.note
            })
        );

        io.to(SOCKET_ROOMS.customer(order.userId)).emit(
            SOCKET_EVENTS.ORDER_STATUS_UPDATE,
            buildPayload.statusUpdate({
                orderId: order._id,
                status: "rider_assigned", // Use the correct enum status
                changedBy: "vendor",
                message: `Rider ${rider.name} has been assigned to your order`,
                riderName: rider.name,
                rider: rider.getPublicProfile ? rider.getPublicProfile() : rider
            })
        );

        // ✅ Use unified notification service for real-time + push capability
        try {
            const { sendRiderNotification } = await import("../services/notification.service.js");
            await sendRiderNotification(rider._id, order._id, "order_assigned", {
                restaurantName: req.vendor.storeName,
                orderDatabaseId: order._id
            });
            console.log(`✅ Assignment notification + push sent to rider: ${rider._id}`);
        } catch (notifErr) {
            console.warn('⚠️ Push/Notification service failed for rider:', notifErr.message);
        }

        res.status(200).json({
            success: true,
            message: "Rider assigned successfully",
            data: { order, rider }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * ✅ FIX: New controller for GET /riders/:riderId/active-order
 * The frontend always called this endpoint but it never existed,
 * causing activeOrder to perpetually be null on the dashboard.
 */
export const getActiveOrder = async (req, res, next) => {
    try {
        const { riderId } = req.params;

        // Auth guard — rider can only fetch their own active order
        if (req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const order = await riderService.getActiveOrder(riderId);

        // ✅ FIX: Returning 200 with null instead of 404.
        // A 404 in the console looks like a "failure" to the user/dev, 
        // but having no active order is a valid and frequent state for a rider.
        res.status(200).json({ 
            success: true, 
            data: { order: order || null } 
        });
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
            .populate({ path: "items.restaurantId", select: "storeName address phone location coords" })
            .populate("userId", "firstname lastname name fullName phone email");

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        if (order.riderId?.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Rider not assigned to this order" });
        }

        const orderObj = order.toObject();
        orderObj.restaurantId = orderObj.items?.[0]?.restaurantId || orderObj.vendorId || null;

        // Populate customer-specific details for Rider UI
        const user = orderObj.userId;
        orderObj.userName = user?.fullName || (user ? `${user.firstname || ""} ${user.lastname || ""}`.trim() : null) || "Customer";
        orderObj.userPhone = user?.phone || orderObj.phone || null;

        const addr = orderObj.deliveryAddress;
        orderObj.deliveryFullAddress = addr?.address || addr?.addressLine || (addr ? `${addr.addressLine || ""}, ${addr.cityName || addr.city || ""}`.trim() : null);

        res.status(200).json({ success: true, data: orderObj });
    } catch (error) {
        next(error);
    }
};

export const updateRiderStatus = async (req, res, next) => {
    try {
        const { riderId } = req.params;
        const { status } = req.body;

        // ✅ FIX: Was calling getSingleRiderForVendor(riderId, req.rider?.vendorId || "dummy")
        // which queries { _id: riderId, vendorId: "dummy" } for admin-managed riders
        // → always throws "Rider not found" BEFORE the status update happens.
        // Now we fetch directly by ID, which works for all rider types.
        const oldRider = await Rider.findById(riderId).populate("currentOrderId");
        if (!oldRider) {
            return res.status(404).json({ success: false, message: "Rider not found" });
        }

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
                // Rider accepted the order
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
                // Rider rejected the order
                const OrderModel = (await import("../model/order/Order.js")).default;
                const VendorOrder = (await import("../model/vendor/VendorOrder.js")).default;

                const order = await OrderModel.findByIdAndUpdate(
                    orderId,
                    {
                        orderStatus: "ready_for_pickup",
                        riderId: null,
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

        // ✅ Notify User (In-app + Push)
        try {
            const { sendOrderNotification, sendVendorNotification } = await import("../services/notification.service.js");
            await sendOrderNotification(order.userId, order._id, "out_for_delivery", {
                orderId: order.orderId || order._id,
                restaurantName: order.restaurantName || "the restaurant"
            });
            
            // Also notify restaurant via WebSocket + In-app
            await sendVendorNotification(order.items?.[0]?.restaurantId || order.vendorId, order._id, "order_dispatched", {
               orderId: order.orderId || order._id,
               message: `Rider ${req.rider.name} has picked up the order and is on the way!`
            });
        } catch (notifErr) {
            console.warn('⚠️ Push/Notification service failed for pick-up:', notifErr.message);
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

        // ✅ Multi-party Notification Cascade (User, Vendor, Admin)
        try {
            const { 
              sendOrderNotification, 
              sendVendorNotification, 
              sendNotification 
            } = await import("../services/notification.service.js");

            // 1. Notify the User (Customer)
            await sendOrderNotification(order.userId, order._id, "delivered", {
                orderId: order.orderId || order._id,
                restaurantName: order.restaurantName || "the restaurant"
            });

            // 2. Notify the Restaurant (Vendor) - Push + In-app
            await sendVendorNotification(order.items?.[0]?.restaurantId || order.vendorId, order._id, "vendor_order_delivered", {
                orderId: order.orderId || order._id,
                customerName: order.deliveryAddress?.name || "the customer"
            });

            // 3. Notify Admins - Push + In-app
            // Pass null for recipientId to broadcast to all online admins in room 'admin_room'
            await sendNotification(null, "admin_order_delivered", {
                orderId: order.orderId || order._id,
                restaurantName: order.restaurantName || "the store"
            }, "admin");

        } catch (notifErr) {
            console.warn('⚠️ Push/Notification cascade failed for delivery:', notifErr.message);
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