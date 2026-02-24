import { SOCKET_EVENTS, SOCKET_ROOMS, buildPayload } from "./rider.events.js";
import Rider from "../model/rider.model.js";
import Order from "../model/order/Order.js";
import VendorOrder from "../model/vendor/VendorOrder.js";

export const registerRiderSocketHandlers = (io, socket) => {
    // --- Room Registration ---

    socket.on(SOCKET_EVENTS.RIDER_CONNECT, ({ riderId }) => {
        try {
            if (!riderId) throw new Error("riderId is required");
            socket.join(SOCKET_ROOMS.rider(riderId));
            socket.data.riderId = riderId;
            console.log(`Rider connected: ${riderId}`);
        } catch (error) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
        }
    });

    socket.on(SOCKET_EVENTS.VENDOR_CONNECT, ({ vendorId }) => {
        try {
            if (!vendorId) throw new Error("vendorId is required");
            socket.join(SOCKET_ROOMS.vendor(vendorId));
            socket.data.vendorId = vendorId;
            console.log(`Vendor connected: ${vendorId}`);
        } catch (error) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
        }
    });

    socket.on(SOCKET_EVENTS.CUSTOMER_CONNECT, ({ customerId }) => {
        try {
            if (!customerId) throw new Error("customerId is required");
            socket.join(SOCKET_ROOMS.customer(customerId));
            socket.data.customerId = customerId;
            console.log(`Customer connected: ${customerId}`);
        } catch (error) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
        }
    });

    // --- Rider Actions ---

    socket.on(SOCKET_EVENTS.RIDER_TOGGLE_AVAILABILITY, async ({ riderId, status }) => {
        try {
            if (!riderId || !status) throw new Error("riderId and status are required");

            const rider = await Rider.findById(riderId);
            if (!rider) throw new Error("Rider not found");

            if (rider.currentOrderId && status === "offline") {
                throw new Error("Cannot go offline while on a delivery");
            }

            if (!["available", "offline"].includes(status)) {
                throw new Error("Invalid status. Use 'available' or 'offline'");
            }

            rider.status = status;
            await rider.save();

            // Notify vendor
            io.to(SOCKET_ROOMS.vendor(rider.vendorId)).emit(
                SOCKET_EVENTS.RIDER_STATUS_CHANGED,
                buildPayload.riderStatusChanged({
                    riderId: rider._id,
                    riderName: rider.name,
                    status
                })
            );
        } catch (error) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
        }
    });

    socket.on(SOCKET_EVENTS.RIDER_PICKED_UP, async ({ riderId, orderId }) => {
        try {
            if (!riderId || !orderId) throw new Error("riderId and orderId are required");

            const order = await Order.findById(orderId);
            if (!order) throw new Error("Order not found");
            if (order.riderId?.toString() !== riderId) throw new Error("Rider not assigned to this order");

            const rider = await Rider.findById(riderId);
            if (!rider) throw new Error("Rider not found");

            // Update Order
            order.orderStatus = "picked_up";
            order.statusLog.push({
                status: "picked_up",
                changedBy: "rider",
                timestamp: new Date()
            });
            await order.save();

            // Update VendorOrder
            await VendorOrder.findOneAndUpdate(
                { userOrderId: order._id, restaurantId: rider.vendorId },
                { orderStatus: "out_for_delivery" }
            );

            const payload = buildPayload.statusUpdate({
                orderId: order._id,
                status: "picked_up",
                changedBy: "rider",
                message: "Rider has picked up the order",
                riderName: rider.name
            });

            // Notify vendor and customer
            io.to(SOCKET_ROOMS.vendor(rider.vendorId)).emit(SOCKET_EVENTS.ORDER_STATUS_UPDATE, payload);
            io.to(SOCKET_ROOMS.customer(order.userId)).emit(SOCKET_EVENTS.ORDER_STATUS_UPDATE, payload);

        } catch (error) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
        }
    });

    socket.on(SOCKET_EVENTS.RIDER_DELIVERED, async ({ riderId, orderId }) => {
        try {
            if (!riderId || !orderId) throw new Error("riderId and orderId are required");

            const order = await Order.findById(orderId);
            if (!order) throw new Error("Order not found");
            if (order.riderId?.toString() !== riderId) throw new Error("Rider not assigned to this order");

            const rider = await Rider.findById(riderId);
            if (!rider) throw new Error("Rider not found");

            // Update Order
            order.orderStatus = "delivered";
            order.statusLog.push({
                status: "delivered",
                changedBy: "rider",
                timestamp: new Date()
            });
            await order.save();

            // Update VendorOrder
            await VendorOrder.findOneAndUpdate(
                { userOrderId: order._id, restaurantId: rider.vendorId },
                { orderStatus: "delivered" }
            );

            // Free up rider
            await rider.freeUp();

            const statusPayload = buildPayload.statusUpdate({
                orderId: order._id,
                status: "delivered",
                changedBy: "rider",
                message: "Order has been delivered",
                riderName: rider.name
            });

            const deliveredPayload = buildPayload.orderDelivered({
                orderId: order._id,
                riderName: rider.name
            });

            // Notify customer
            io.to(SOCKET_ROOMS.customer(order.userId)).emit(SOCKET_EVENTS.ORDER_DELIVERED, deliveredPayload);

            // Notify vendor
            io.to(SOCKET_ROOMS.vendor(rider.vendorId)).emit(SOCKET_EVENTS.ORDER_STATUS_UPDATE, statusPayload);

        } catch (error) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
        }
    });
};
