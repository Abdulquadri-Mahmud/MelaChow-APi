// workers/deliveryWatchdog.worker.js
import { Worker } from "bullmq";
import mongoose from "mongoose";
import { redisConnection } from "../config/redis.js";
import Order from "../model/order/Order.js";
import VendorOrder from "../model/vendor/VendorOrder.js";
import Rider from "../model/rider.model.js";
import RiderAssignment from "../model/riderAssignment.model.js";
import OrderTermination from "../model/OrderTermination.js";
import { offerOrderToAvailableRiders } from "../services/riderAssignment.service.js";
import logger from "../config/logger.js";

new Worker("delivery-watchdog", async (job) => {
    const { orderId, vendorOrderId, riderId } = job.data;
    logger.info({ orderId, riderId }, "⏰ Delivery watchdog fired");

    const vendorOrder = await VendorOrder.findById(vendorOrderId).populate("userOrderId");
    if (!vendorOrder?.userOrderId) {
        logger.warn({ vendorOrderId }, "Watchdog: vendorOrder not found — skipping");
        return;
    }

    const order = vendorOrder.userOrderId;

    // Already resolved — nothing to do
    if (["delivered","cancelled"].includes(order.orderStatus)) {
        logger.info({ orderId }, "Watchdog: order already resolved — no action");
        return;
    }

    // Determine if food was already picked up
    const foodPickedUp = ["out_for_delivery","picked_up"].includes(order.orderStatus);

    const rider = await Rider.findById(riderId).select("name phone terminationStrikes");
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // 1. Mark assignment as timeout
        await RiderAssignment.findOneAndUpdate(
            { riderId, orderId: order._id, status: { $in: ["assigned","accepted","picked_up"] } },
            { $set: { status: "timeout", respondedAt: new Date(), reason: "system_timeout" } },
            { session, sort: { createdAt: -1 } }
        );

        // 2. Reset order
        await Order.findByIdAndUpdate(order._id, {
            $set: {
                orderStatus: "ready_for_pickup",
                riderId: null,
                "riderAssignment.status": "unassigned",
                "riderAssignment.lastReason": "system_timeout",
            },
            $push: { statusLog: { status:"ready_for_pickup", changedBy:"system:watchdog", timestamp:new Date() } },
        }, { session });

        // 3. Reset vendor order
        await VendorOrder.findByIdAndUpdate(vendorOrderId,
            { $set: { orderStatus:"ready_for_pickup", riderId:null } },
            { session }
        );

        // 4. Free rider
        await Rider.findByIdAndUpdate(riderId, {
            $set: { status:"available", currentOrderId:null, assignmentExpiresAt:null },
        }, { session });

        // 5. Create termination record
        await OrderTermination.create([{
            orderId: order._id,
            vendorOrderId,
            previousRiderId: riderId,
            previousRiderName:  rider?.name  || "Unknown",
            previousRiderPhone: rider?.phone || "Unknown",
            foodPickedUp,
            reason: "system_timeout",
            status: "pending",
        }], { session });

        // 6. Log strike ONLY if food was already picked up
        if (foodPickedUp) {
            const { TERMINATION_STRIKE_LIMIT, SUSPENSION_DURATION_MS } = await import("../config/payouts.js");
            const updatedRider = await Rider.findByIdAndUpdate(riderId, {
                $inc: { terminationStrikes: 1 },
                $set: { lastTerminationAt: new Date() },
            }, { session, new: true });

            if (updatedRider.terminationStrikes >= TERMINATION_STRIKE_LIMIT) {
                await Rider.findByIdAndUpdate(riderId, {
                    $set: {
                        isSuspended: true,
                        suspendedUntil: new Date(Date.now() + SUSPENSION_DURATION_MS),
                        status: "offline",
                    },
                }, { session });
                logger.warn({ riderId }, "🚫 Rider suspended after strike threshold");
            }
        }

        await session.commitTransaction();
        logger.info({ orderId, riderId, foodPickedUp }, "✅ Watchdog: order reset complete");

    } catch (err) {
        if (session.inTransaction()) await session.abortTransaction();
        logger.error({ orderId, riderId, error: err.message }, "❌ Watchdog transaction failed");
        throw err;
    } finally {
        session.endSession();
    }

    // 7. Notify customer (non-fatal)
    try {
        const { sendNotification } = await import("../services/notification.service.js");
        await sendNotification(order.userId, "rider_timeout_reassigning", {
            orderId: order.orderId,
            message: "We are finding you a new rider. Hang tight.",
        }, "user");
    } catch (e) { logger.warn({ error: e.message }, "Watchdog: customer notify failed (non-fatal)"); }

    // 8. Notify old rider (non-fatal)
    try {
        const { sendRiderNotification } = await import("../services/notification.service.js");
        await sendRiderNotification(riderId, order._id, "delivery_timed_out", {
            message: "Your delivery was timed out by the system.",
        });
    } catch (e) { logger.warn({ error: e.message }, "Watchdog: rider notify failed (non-fatal)"); }

    // 9. Re-broadcast (non-fatal — OrderBroadcastQueue is the safety net)
    try {
        await offerOrderToAvailableRiders({ vendorOrderId, assignedBy: "system:watchdog" });
    } catch (e) {
        logger.error({ vendorOrderId, error: e.message }, "❌ Watchdog re-broadcast failed");
    }

}, {
    connection: redisConnection,
    concurrency: 5,
    limiter: { max: 10, duration: 1_000 },
});
