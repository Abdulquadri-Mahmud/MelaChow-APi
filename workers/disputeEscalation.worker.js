// workers/disputeEscalation.worker.js
import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import Order from "../model/order/Order.js";
import logger from "../config/logger.js";

new Worker("dispute-escalation", async (job) => {
    const { orderId } = job.data;
    logger.info({ orderId }, "⏰ Dispute escalation watchdog fired");

    const order = await Order.findById(orderId);
    if (!order) return;

    // Check if the order is still disputed
    if (order.orderStatus !== "disputed_delivery") {
        logger.info({ orderId }, "Dispute already resolved or status changed — skipping escalation");
        return;
    }

    try {
        // (1) Update Order status to remain as 'disputed_delivery' so admin dashboard surfaces it
        await Order.findByIdAndUpdate(orderId, {
            $set: { orderStatus: "disputed_delivery" },
            $push: {
                statusLog: {
                    status: "disputed_delivery",
                    changedBy: "system:dispute_escalation",
                    timestamp: new Date()
                }
            }
        });

        // (2) Send an admin notification via sendNotification
        const { sendNotification } = await import("../services/notification.service.js");
        await sendNotification(null, "dispute_escalation_admin", {
            orderId: order.orderId,
            orderDatabaseId: order._id.toString(),
            message: `disputed delivery remake window expired without response for Order #${order.orderId}. Admin attention required.`,
        }, "admin");

        logger.info({ orderId }, "✅ Dispute escalated to admin successfully");
    } catch (err) {
        logger.error({ orderId, error: err.message }, "❌ Dispute escalation worker failed");
        throw err;
    }
}, {
    connection: redisConnection,
    concurrency: 5,
});
