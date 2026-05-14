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

    if (!cityId || !stateId) {
        return { success: false, reason: "missing_location", riderCount: 0 };
    }

    const candidateRiders = await Rider.find({
        managedBy: "admin",
        cityId,
        stateId,
        status: "available",
        isActive: true,
        isVerified: true,
        deletedAt: null,
        currentOrderId: null,
    });

    await expireStaleRiderAssignmentOffers(candidateRiders.map((rider) => rider._id));

    const activeAssignments = await RiderAssignment.find({
        riderId: { $in: candidateRiders.map((rider) => rider._id) },
        status: "assigned",
        expiresAt: { $gt: new Date() },
    }).select("riderId");
    const busyRiderIds = new Set(activeAssignments.map((assignment) => assignment.riderId.toString()));
    const riders = candidateRiders.filter((rider) => !busyRiderIds.has(rider._id.toString()));

    if (!riders.length) {
        return { success: false, reason: "no_available_riders", riderCount: 0 };
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

        if (orderUpdate.modifiedCount !== 1 || riderUpdate.modifiedCount !== riderIds.length) {
            throw new Error("Order or rider availability changed during assignment");
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
