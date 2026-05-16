import mongoose from "mongoose";
import Order from "../model/order/Order.js";
import VendorOrder from "../model/vendor/VendorOrder.js";
import Vendor from "../model/vendor/vendor.model.js";
import Rider from "../model/rider.model.js";
import RiderAssignment from "../model/riderAssignment.model.js";
import { getPlatformConfig } from "./platformConfig.service.js";

const AUTOMATIC_ASSIGNMENT_EXPIRES_AT = new Date("9999-12-31T23:59:59.999Z");

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

    // ✅ FIX: Removed 'managedBy: admin' to allow ALL available riders in the city 
    // to participate in the automated broadcast, ensuring maximum fulfillment coverage.
    const riderQuery = {
        cityId,
        stateId,
        status: { $in: ["available", "pending_assignment"] },
        isActive: true,
        isVerified: true,
        deletedAt: null,
        currentOrderId: null,
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

    // ✅ FIX: Exclude any rider who has EVER been offered this order
    // This prevents re-broadcasting an order to a rider who already rejected it or timed out.
    const pastAssignments = await RiderAssignment.find({
        orderId: masterOrder._id
    }).select("riderId");
    const alreadyHandledIds = new Set(pastAssignments.map(a => a.riderId.toString()));

    const riders = candidateRiders.filter(
        (rider) => !alreadyHandledIds.has(rider._id.toString())
    );

    if (!riders.length) {
        return { success: false, reason: "no_new_riders_to_broadcast", riderCount: 0 };
    }

    const assignmentExpiresAt = AUTOMATIC_ASSIGNMENT_EXPIRES_AT;
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
            // It's okay if riderUpdate.modifiedCount is 0 (e.g. they were already pending_assignment)
            // But the order must be successfully transitioned or remain in assigned state
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

    const platformConfig = await getPlatformConfig();
    const riderPayout = platformConfig.riderFixedPayout || 600;

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

        // Find all orders that are waiting for a rider
        const pendingOrders = await VendorOrder.find({
            orderStatus: { $in: ["ready_for_pickup", "rider_assigned"] },
            deletedAt: null
        }).limit(10);

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
