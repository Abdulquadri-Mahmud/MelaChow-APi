import { SOCKET_EVENTS, SOCKET_ROOMS, buildPayload } from "./rider.events.js";
import Rider from "../model/rider.model.js";
import Order from "../model/order/Order.js";
import VendorOrder from "../model/vendor/VendorOrder.js";

export const registerRiderSocketHandlers = (io, socket) => {

    // --- Room Registration ---

    socket.on(SOCKET_EVENTS.RIDER_CONNECT, ({ riderId } = {}) => {
        try {
            if (!riderId) throw new Error("riderId is required");
            socket.join(SOCKET_ROOMS.rider(riderId));
            socket.data.riderId = riderId;
            console.log(`🛵 Rider connected: ${riderId}`);
        } catch (error) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
        }
    });

    socket.on(SOCKET_EVENTS.VENDOR_CONNECT, ({ vendorId } = {}) => {
        try {
            if (!vendorId) throw new Error("vendorId is required");
            socket.join(SOCKET_ROOMS.vendor(vendorId));
            socket.data.vendorId = vendorId;
            console.log(`🏪 Vendor connected: ${vendorId}`);
        } catch (error) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
        }
    });

    socket.on(SOCKET_EVENTS.CUSTOMER_CONNECT, ({ customerId } = {}) => {
        try {
            if (!customerId) throw new Error("customerId is required");
            socket.join(SOCKET_ROOMS.customer(customerId));
            socket.data.customerId = customerId;
            console.log(`👤 Customer connected: ${customerId}`);
        } catch (error) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
        }
    });

    // --- Rider Actions ---

    socket.on(SOCKET_EVENTS.RIDER_TOGGLE_AVAILABILITY, async ({ riderId, status } = {}) => {
        try {
            if (!riderId || !status) throw new Error("riderId and status are required");

            const rider = await Rider.findById(riderId);
            if (!rider) throw new Error("Rider not found");

            if (!["available", "offline"].includes(status)) {
                throw new Error("Invalid status. Use 'available' or 'offline'");
            }

            // ✅ FIX: Block going offline if rider has an active assignment.
            // Original only checked currentOrderId but pending_assignment status
            // is the reliable signal — currentOrderId can lag behind local state.
            const isActivelyAssigned =
                rider.currentOrderId ||
                rider.status === "pending_assignment" ||
                rider.status === "on_delivery";

            if (isActivelyAssigned && status === "offline") {
                throw new Error("Cannot go offline while on a delivery");
            }

            rider.status = status;
            await rider.save();

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

    socket.on(SOCKET_EVENTS.RIDER_PICKED_UP, async ({ riderId, orderId } = {}) => {
        try {
            if (!riderId || !orderId) throw new Error("riderId and orderId are required");

            const order = await Order.findById(orderId);
            if (!order) throw new Error("Order not found");
            if (order.riderId?.toString() !== riderId) throw new Error("Rider not assigned to this order");

            const rider = await Rider.findById(riderId);
            if (!rider) throw new Error("Rider not found");

            // ✅ FIX: Was setting order.orderStatus = "picked_up" which is not a
            // valid status in the Order model. The correct status is "out_for_delivery"
            // (consistent with the REST markPickedUp endpoint in rider.service.js).
            order.orderStatus = "out_for_delivery";
            order.statusLog.push({
                status: "out_for_delivery",
                changedBy: "rider",
                timestamp: new Date()
            });
            await order.save();

            // updateMany keyed on userOrderId only — works for admin-managed riders
            // whose rider.vendorId is null. Matches the fix applied to rider.service.js.
            await VendorOrder.updateMany(
                { userOrderId: order._id },
                { $set: { orderStatus: "out_for_delivery" } }
            );

            // ✅ FIX: Also update rider status to on_delivery
            await Rider.findByIdAndUpdate(riderId, { status: "on_delivery" });

            const payload = buildPayload.statusUpdate({
                orderId: order._id,
                status: "picked_up",
                changedBy: "rider",
                message: "Rider has picked up the order",
                riderName: rider.name
            });

            io.to(SOCKET_ROOMS.vendor(rider.vendorId)).emit(SOCKET_EVENTS.ORDER_STATUS_UPDATE, payload);
            io.to(SOCKET_ROOMS.customer(order.userId)).emit(SOCKET_EVENTS.ORDER_STATUS_UPDATE, payload);

        } catch (error) {
            socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
        }
    });

    // RIDER_DELIVERED socket event is intentionally disabled.
    //
    // Delivery confirmation requires OTP verification — the customer must
    // provide a 6-digit code to the rider, which is validated server-side
    // before the order is marked delivered. This cannot be safely enforced
    // in a socket handler.
    //
    // The correct flow is:
    //   1. Rider taps "Delivered" → POST /riders/:riderId/request-delivery-otp
    //   2. Customer receives OTP via email
    //   3. Rider submits code → POST /riders/:riderId/confirm-delivery
    //   4. Server verifies OTP, then calls markDelivered (payout + escrow + status)
    //
    // Any client emitting this socket event receives an error directing them
    // to the REST endpoint. No order state is written.
    socket.on(SOCKET_EVENTS.RIDER_DELIVERED, ({ riderId, orderId } = {}) => {
        socket.emit(SOCKET_EVENTS.ERROR, {
            message: 'Delivery confirmation must go through the REST API to enforce customer OTP verification. Use POST /riders/:riderId/confirm-delivery.',
            code: 'USE_REST_ENDPOINT',
        });
        console.warn(`⚠️ Rider ${riderId} attempted socket delivery confirmation for order ${orderId} — blocked. REST endpoint required.`);
    });
};