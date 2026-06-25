// workers/broadcastTimeout.worker.js
import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import VendorOrder from "../model/vendor/VendorOrder.js";
import Order from "../model/order/Order.js";
import OrderBroadcastQueue from "../model/OrderBroadcastQueue.js";
import { offerOrderToAvailableRiders } from "../services/riderAssignment.service.js";
import logger from "../config/logger.js";

export const broadcastTimeoutWorker = new Worker("broadcast-timeout", async (job) => {
    const { vendorOrderId, orderId } = job.data;
    const attempt = job.attemptsMade + 1;

    const vendorOrder = await VendorOrder.findById(vendorOrderId);
    if (!vendorOrder || vendorOrder.riderId) return; // already assigned

    const masterOrder = await Order.findById(orderId);
    if (!masterOrder || ["cancelled","delivered"].includes(masterOrder.orderStatus)) return;

    logger.warn({ vendorOrderId, orderId, attempt }, "⏰ Broadcast timeout — attempting re-broadcast");

    const result = await offerOrderToAvailableRiders({
        vendorOrderId,
        assignedBy: `system:timeout_attempt_${attempt}`,
    });

    if (!result.success && result.reason === "no_new_riders_to_broadcast") {
        // All riders busy — enqueue into OrderBroadcastQueue (FIFO dispatch)
        await OrderBroadcastQueue.findOneAndUpdate(
            { vendorOrderId },
            {
                $setOnInsert: {
                    orderId: masterOrder._id,
                    vendorOrderId,
                    cityId:  masterOrder.deliveryAddress?.cityId || null,
                    stateId: masterOrder.deliveryAddress?.stateId || null,
                    queuedAt: new Date(),
                },
                $set: { status: "waiting" },
                $inc: { attemptCount: 1 },
            },
            { upsert: true, new: true }
        );
        logger.info({ vendorOrderId }, "📥 Order enqueued in OrderBroadcastQueue — all riders busy");
    }

    // Notify vendor at attempt 2 (10 min)
    if (attempt === 2) {
        try {
            const { sendNotification } = await import("../services/notification.service.js");
            await sendNotification(vendorOrder.restaurantId, "order_rider_delay", {
                orderId: masterOrder.orderId,
                message: "We are still finding a rider for this order.",
            }, "vendor");
        } catch (e) { logger.warn({ error: e.message }, "Vendor delay notify failed (non-fatal)"); }
    }

    // Notify customer at attempt 3 (15 min)
    if (attempt === 3) {
        try {
            const { sendNotification } = await import("../services/notification.service.js");
            await sendNotification(masterOrder.userId, "order_rider_delay_customer", {
                orderId: masterOrder.orderId,
                message: "We are working on assigning a rider. Thank you for your patience.",
            }, "user");
        } catch (e) { logger.warn({ error: e.message }, "Customer delay notify failed (non-fatal)"); }
    }

}, {
    connection: redisConnection,
    concurrency: 10,
});
