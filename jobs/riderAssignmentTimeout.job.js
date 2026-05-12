import mongoose from "mongoose";
import Rider from "../model/rider.model.js";
import Order from "../model/order/Order.js";
import VendorOrder from "../model/vendor/VendorOrder.js";
import RiderAssignment from "../model/riderAssignment.model.js";
import { sendNotification } from "../services/notification.service.js";
import { emitToAdmin, emitToRestaurant } from "../socket/socketServer.js";

const MAX_TIMEOUTS_PER_SWEEP = 25;

export async function expireStaleRiderAssignments() {
    const now = new Date();
    const staleAssignments = await RiderAssignment.find({
        status: "assigned",
        expiresAt: { $lte: now },
    }).sort({ expiresAt: 1 }).limit(MAX_TIMEOUTS_PER_SWEEP).lean();

    let expired = 0;

    for (const assignment of staleAssignments) {
        const session = await mongoose.startSession();
        let order = null;

        try {
            await session.withTransaction(async () => {
                const riderUpdate = await Rider.updateOne(
                    {
                        _id: assignment.riderId,
                        status: "pending_assignment",
                    },
                    {
                        $set: { status: "available", assignmentExpiresAt: null },
                        $unset: { currentOrderId: "" },
                    },
                    { session }
                );

                if (riderUpdate.modifiedCount !== 1) {
                    await RiderAssignment.updateOne(
                        { _id: assignment._id, status: "assigned" },
                        { $set: { status: "timeout", respondedAt: now, reason: "expired_or_already_changed" } },
                        { session }
                    );
                    return;
                }

                await RiderAssignment.updateOne(
                    { _id: assignment._id, status: "assigned" },
                    { $set: { status: "timeout", respondedAt: now, reason: "assignment_expired" } },
                    { session }
                );

                const remainingOffers = await RiderAssignment.countDocuments({
                    orderId: assignment.orderId,
                    status: "assigned",
                    expiresAt: { $gt: now },
                }).session(session);

                if (remainingOffers === 0) {
                    order = await Order.findOneAndUpdate(
                        {
                            _id: assignment.orderId,
                            orderStatus: "rider_assigned",
                            riderId: null,
                        },
                        {
                            $set: {
                                orderStatus: "ready_for_pickup",
                                riderAssignment: {
                                    status: "timeout",
                                    assignedAt: assignment.assignedAt,
                                    acceptedAt: null,
                                    rejectedAt: now,
                                    expiresAt: null,
                                    lastReason: "timeout",
                                    assignedBy: assignment.assignedBy || null,
                                },
                            },
                            $push: {
                                statusLog: {
                                    status: "rider_assignment_timeout",
                                    changedBy: "system",
                                    timestamp: now,
                                },
                            },
                        },
                        { new: true, session }
                    );

                    await VendorOrder.updateMany(
                        { userOrderId: assignment.orderId },
                        { $set: { orderStatus: "ready_for_pickup", riderId: null } },
                        { session }
                    );
                } else {
                    order = await Order.findById(assignment.orderId).session(session);
                }

                expired += 1;
            });

            if (order) {
                const orderLabel = order.orderId || order._id;
                await sendNotification(null, "rider_assignment_timeout", {
                    orderId: orderLabel,
                    orderDatabaseId: order._id,
                    riderId: assignment.riderId,
                    reason: "timeout",
                    message: `Rider did not accept Order #${orderLabel} in time. Manual reassignment required.`,
                }, "admin");

                emitToAdmin(null, "rider_assignment_timeout", {
                    orderId: order._id,
                    orderReadableId: orderLabel,
                    riderId: assignment.riderId,
                    vendorId: assignment.vendorId,
                    message: "Manual rider reassignment required.",
                });

                if (assignment.vendorId) {
                    emitToRestaurant(assignment.vendorId, "order_status_update", {
                        orderId: order._id,
                        status: "rider_assignment_timeout",
                        message: "The assigned rider did not respond in time. Admin will reassign.",
                    });
                }
            }
        } catch (error) {
            console.error("Rider assignment timeout sweep failed:", error.message);
        } finally {
            session.endSession();
        }
    }

    return { expired };
}
