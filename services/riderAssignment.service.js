import mongoose from "mongoose";
import Order from "../model/order/Order.js";
import VendorOrder from "../model/vendor/VendorOrder.js";
import Vendor from "../model/vendor/vendor.model.js";
import Rider from "../model/rider.model.js";
import RiderAssignment from "../model/riderAssignment.model.js";
import OrderTermination from "../model/OrderTermination.js";
import { getPlatformConfig } from "./platformConfig.service.js";
import OrderBroadcastQueue from "../model/OrderBroadcastQueue.js";
import { RIDER_FIXED_PAYOUT, BROADCAST_TTL_SECONDS } from "../config/payouts.js";
import logger from "../config/logger.js";

const getBroadcastExpiresAt = () => new Date(Date.now() + BROADCAST_TTL_SECONDS * 1_000);

export const expireStaleRiderAssignmentOffers = async (riderIds = []) => {
    const ids = [...new Set(riderIds.map((id) => id?.toString()).filter(Boolean))];
    if (!ids.length) return { expiredCount: 0, riderIds: [] };

    const staleAssignments = await RiderAssignment.find({
        riderId: { $in: ids },
        status: "assigned",
        expiresAt: { $lte: new Date() },
    }).select("riderId orderId");

    if (!staleAssignments.length) return { expiredCount: 0, riderIds: [] };

    const staleRiderIds = [...new Set(staleAssignments.map((assignment) => assignment.riderId.toString()))];

    await RiderAssignment.updateMany(
        { _id: { $in: staleAssignments.map((assignment) => assignment._id) } },
        { $set: { status: "timeout", respondedAt: new Date(), reason: "assignment_expired" } }
    );

    await Rider.updateMany(
        {
            _id: { $in: staleRiderIds },
            status: "pending_assignment",
        },
        {
            $set: { status: "available", assignmentExpiresAt: null },
            $unset: { currentOrderId: "" },
        }
    );

    return { expiredCount: staleAssignments.length, riderIds: staleRiderIds };
};

export const offerOrderToAvailableRiders = async ({ vendorOrderId, assignedBy = null }) => {
    const vendorOrder = await VendorOrder.findById(vendorOrderId).populate("userOrderId");
    if (!vendorOrder?.userOrderId) {
        return { success: false, reason: "order_not_found", riderCount: 0 };
    }

    const masterOrder = vendorOrder.userOrderId;
    const vendor = await Vendor.findById(vendorOrder.restaurantId).select("storeName cityId stateId");
    const cityId = masterOrder.deliveryAddress?.cityId || vendor?.cityId || null;
    const stateId = masterOrder.deliveryAddress?.stateId || vendor?.stateId || null;

    console.log(`🔍 [Broadcast Assignment] Resolving location for Order ${masterOrder.orderId}:`, {
        cityId,
        stateId,
        deliveryCityId: masterOrder.deliveryAddress?.cityId,
        vendorCityId: vendor?.cityId
    });

    if (!cityId || !stateId) {
        console.warn(`⚠️ [Broadcast Assignment] Missing location IDs for Order ${masterOrder.orderId}. Cannot broadcast.`);
        return { success: false, reason: "missing_location", riderCount: 0 };
    }

    // ✅ FIX: Removed 'managedBy: admin' and allowed 'on_delivery' status
    // to participate in the automated broadcast, ensuring riders can stack/receive queued offers.
    const riderQuery = {
        cityId,
        stateId,
        status: { $in: ["available", "pending_assignment", "on_delivery"] },
        isActive: true,
        isVerified: true,
        isSuspended: { $ne: true },
        deletedAt: null,
    };

    console.log(`🔍 [Broadcast Assignment] Searching for riders with query:`, riderQuery);
    
    // 💡 SELF-HEALING: Reset riders stuck in 'pending_assignment' but with no active RiderAssignment record
    const stuckRiders = await Rider.find({
        cityId,
        stateId,
        status: "pending_assignment",
        currentOrderId: null
    }).select("_id");

    if (stuckRiders.length > 0) {
        const stuckIds = stuckRiders.map(r => r._id);
        const activeAssignmentCount = await RiderAssignment.countDocuments({
            riderId: { $in: stuckIds },
            status: "assigned",
            expiresAt: { $gt: new Date() }
        });

        // If number of active assignments is less than stuck riders, some need resetting
        if (activeAssignmentCount < stuckIds.length) {
            console.log(`🧹 [Broadcast Assignment] Found potentially stuck riders. Reconciling...`);
            for (const riderId of stuckIds) {
                const hasActive = await RiderAssignment.exists({
                    riderId,
                    status: "assigned",
                    expiresAt: { $gt: new Date() }
                });
                if (!hasActive) {
                    await Rider.updateOne({ _id: riderId }, { $set: { status: "available" } });
                    console.log(`✅ [Broadcast Assignment] Reset stuck rider ${riderId} to 'available'`);
                }
            }
        }
    }

    const candidateRiders = await Rider.find(riderQuery);
    console.log(`🔍 [Broadcast Assignment] Found ${candidateRiders.length} candidate riders.`);

    await expireStaleRiderAssignmentOffers(candidateRiders.map((rider) => rider._id));

    // A rider who rejected or terminated this order must not receive it again.
    // Timeouts remain eligible because they may simply have been busy.
    const [pastRejects, pastTerminations] = await Promise.all([
        RiderAssignment.find({
            vendorOrderId: vendorOrder._id,
            status: "rejected",
        }).select("riderId"),
        OrderTermination.find({
            orderId: masterOrder._id,
            status: { $in: ["pending", "reassigned", "disputed", "resolved"] },
        }).select("previousRiderId"),
    ]);
    const alreadyHandledIds = new Set([
        ...pastRejects.map((assignment) => assignment.riderId.toString()),
        ...pastTerminations.map((termination) => termination.previousRiderId.toString()),
    ]);

    const riders = candidateRiders.filter(
        (rider) => !alreadyHandledIds.has(rider._id.toString())
    );

    if (!riders.length) {
        // All riders busy or none available — enqueue for FIFO dispatch when a rider frees up.
        try {
            await OrderBroadcastQueue.findOneAndUpdate(
                { vendorOrderId: vendorOrder._id },
                {
                    $setOnInsert: {
                        orderId:      masterOrder._id,
                        vendorOrderId: vendorOrder._id,
                        cityId:       cityId  || null,
                        stateId:      stateId || null,
                        queuedAt:     new Date(),
                    },
                    $set:  { status: "waiting" },
                    $inc:  { attemptCount: 1 },
                },
                { upsert: true, new: true }
            );
            logger.info({ vendorOrderId: vendorOrder._id }, "📥 No riders available — queued in OrderBroadcastQueue");
        } catch (qErr) {
            logger.error({ error: qErr.message }, "❌ OrderBroadcastQueue upsert failed");
        }
        return { success: false, reason: "no_new_riders_to_broadcast", riderCount: 0 };
    }

    // Mark order as broadcasting in queue (if it was waiting)
    await OrderBroadcastQueue.findOneAndUpdate(
        { vendorOrderId: vendorOrder._id, status: "waiting" },
        { $set: { status: "broadcasting", lastAttemptAt: new Date() } }
    ).catch(() => {}); // non-fatal

    // Fresh expiry calculated at broadcast time so every offer has exactly 90 s
    const assignmentExpiresAt = getBroadcastExpiresAt();
    const riderIds = riders.map((rider) => rider._id);
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        await VendorOrder.updateMany(
            { userOrderId: masterOrder._id },
            { $set: { orderStatus: "rider_assigned" } },
            { session }
        );

        const orderUpdate = await Order.updateOne(
            { _id: masterOrder._id, riderId: null, orderStatus: { $in: ["ready_for_pickup", "ready", "rider_assigned"] } },
            {
                $set: {
                    orderStatus: "rider_assigned",
                    riderAssignment: {
                        status: "assigned",
                        assignedAt: new Date(),
                        acceptedAt: null,
                        rejectedAt: null,
                        expiresAt: assignmentExpiresAt,
                        lastReason: "",
                        assignedBy,
                    },
                },
                $push: {
                    statusLog: {
                        status: "rider_assigned",
                        changedBy: assignedBy ? `admin:${assignedBy}` : "system:auto_assignment",
                        timestamp: new Date(),
                    },
                },
            },
            { session }
        );

        const riderUpdate = await Rider.updateMany(
            {
                _id: { $in: riderIds },
                status: "available",
                isActive: true,
                isVerified: true,
                deletedAt: null,
                currentOrderId: null,
                cityId,
                stateId,
            },
            { $set: { status: "pending_assignment", assignmentExpiresAt } },
            { session }
        );

        if (orderUpdate.modifiedCount !== 1) {
            // Order could not be transitioned: already assigned, cancelled, or wrong status.
            // Abort the entire broadcast — do not create ghost RiderAssignment records.
            throw new Error(
                `Order ${masterOrder._id} could not be transitioned to rider_assigned ` +
                `(modifiedCount=${orderUpdate.modifiedCount}). Concurrent modification or wrong status.`
            );
        }

        await RiderAssignment.create(riderIds.map((riderId) => ({
            orderId: masterOrder._id,
            vendorOrderId: vendorOrder._id,
            riderId,
            vendorId: vendorOrder.restaurantId,
            stateId,
            cityId,
            status: "assigned",
            assignedBy,
            expiresAt: assignmentExpiresAt,
            metadata: {
                restaurantName: vendor?.storeName || "",
                orderReadableId: masterOrder.orderId || "",
                assignmentMode: "automatic",
            },
        })), { session, ordered: true });

        await session.commitTransaction();
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }

    // ── Queue broadcast timeout job ─────────────────────────────────────
    try {
        const { broadcastTimeoutQueue } = await import("../config/queue.js");
        await broadcastTimeoutQueue.add(
            "broadcast-no-acceptance",
            { vendorOrderId: vendorOrder._id.toString(), orderId: masterOrder._id.toString() },
            {
                jobId:            `broadcast-timeout:${vendorOrder._id}`,
                delay:            (BROADCAST_TTL_SECONDS + 5) * 1_000,
                attempts:         3,
                backoff:          { type: "fixed", delay: BROADCAST_TTL_SECONDS * 1_000 },
                removeOnComplete: true,
                removeOnFail:     false,
            }
        );
    } catch (queueErr) {
        logger.error({ vendorOrderId: vendorOrder._id, error: queueErr.message },
            "⚠️ broadcastTimeoutQueue add failed (non-fatal)");
    }

    const platformConfig = await getPlatformConfig();
    const riderPayout = platformConfig.riderFixedPayout ?? RIDER_FIXED_PAYOUT;

    try {
        const { emitToRider, emitToAdmin } = await import("../socket/socketServer.js");
        const { SOCKET_EVENTS, buildPayload } = await import("../socket/rider.events.js");
        const { sendRiderNotification, sendNotification } = await import("./notification.service.js");

        await Promise.all(riders.map(async (rider) => {
            emitToRider(rider._id, SOCKET_EVENTS.ORDER_ASSIGNED_TO_RIDER, buildPayload.orderAssigned({
                orderId: masterOrder._id,
                riderId: rider._id,
                vendorId: vendor?._id,
                vendorName: vendor?.storeName,
                items: masterOrder.items,
                deliveryAddress: masterOrder.deliveryAddress,
                customerName: masterOrder.deliveryAddress?.name || "Customer",
                customerPhone: masterOrder.deliveryAddress?.phone,
                note: masterOrder.note,
                payout: riderPayout,
                assignmentMode: "automatic",
                assignmentExpiresAt,
            }));

            await sendRiderNotification(rider._id, masterOrder._id, "order_assigned", {
                restaurantName: vendor?.storeName,
                orderDatabaseId: masterOrder._id,
                payout: riderPayout,
                assignmentMode: "automatic",
                assignmentExpiresAt,
            });
        }));

        emitToAdmin(null, "rider_assignment_confirmed", {
            vendorOrderId: vendorOrder._id,
            riderIds,
            restaurantName: vendor?.storeName,
            assignmentMode: "automatic",
            confirmedAt: new Date().toISOString(),
        });

        await sendNotification(null, "rider_assignment_needed", {
            orderId: masterOrder.orderId || masterOrder._id,
            orderDatabaseId: masterOrder._id,
            vendorOrderId: vendorOrder._id,
            message: `Automatic assignment sent to ${riders.length} rider(s). Waiting for first acceptance.`,
        }, "admin");
    } catch (error) {
        console.warn("Automatic rider assignment notification failed:", error.message);
    }

    return { success: true, riderCount: riders.length, riderIds };
};

/**
 * Catch-up: Instant broadcast of all pending orders to a newly available rider.
 */
export const catchupRiderWithPendingOrders = async (riderId) => {
    try {
        const rider = await Rider.findById(riderId);
        if (!rider || (rider.status !== "available" && rider.status !== "pending_assignment") || rider.currentOrderId) {
            return { success: false, reason: "rider_not_eligible" };
        }

        // 1. Dispatch queued orders for this rider's city (FIFO, one at a time)
        const queuedOrder = await OrderBroadcastQueue.findOneAndUpdate(
            { status: "waiting", cityId: rider.cityId },
            { $set: { status: "broadcasting", lastAttemptAt: new Date() } },
            { sort: { queuedAt: 1 }, new: true }
        );

        if (queuedOrder) {
            logger.info({ vendorOrderId: queuedOrder.vendorOrderId, riderId },
                "🔄 Dispatching queued order to newly available rider");
            const result = await offerOrderToAvailableRiders({
                vendorOrderId: queuedOrder.vendorOrderId,
                assignedBy: "system:catchup_queue",
            });
            if (!result.success) {
                // Re-mark as waiting if broadcast failed
                await OrderBroadcastQueue.findByIdAndUpdate(queuedOrder._id,
                    { $set: { status: "waiting" } });
            }
            return { success: true, broadcasted: result.success ? 1 : 0 };
        }

        // 2. Fallback: standard pending order scan for this city only
        const pendingOrders = await VendorOrder.find({
            orderStatus: { $in: ["ready_for_pickup", "rider_assigned"] },
            cityId:      rider.cityId,
            stateId:     rider.stateId,
            deletedAt:   null,
        }).limit(5);

        if (!pendingOrders.length) return { success: true, broadcasted: 0 };

        let count = 0;
        for (const vOrder of pendingOrders) {
            const result = await offerOrderToAvailableRiders({
                vendorOrderId: vOrder._id,
                assignedBy: null
            });
            if (result.success) count++;
        }

        return { success: true, broadcasted: count };
    } catch (error) {
        console.error("❌ [Catch-up] Failed:", error.message);
        return { success: false, error: error.message };
    }
};
