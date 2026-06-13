import * as riderService from "../services/rider.service.js";
import { SOCKET_EVENTS, SOCKET_ROOMS, buildPayload } from "../socket/rider.events.js";
import { getIO } from "../socket/socketServer.js";
import Notification from "../model/notification/notification.model.js";
import Order from "../model/order/Order.js";
import Rider from "../model/rider.model.js";
import RiderAssignment from "../model/riderAssignment.model.js";
import PlatformVehicle from "../model/platformVehicle.model.js";
import { sendDeliveryOTP, verifyDeliveryOTP, getActiveDeliveryOTP } from '../services/otp.service.js';
import { validateVendorLocation } from "../services/locationService.js";
import mongoose from "mongoose";
import { usePostgresAdminRiderReads, usePostgresRiderAssignmentWrites, usePostgresRiderReads } from "../services/postgres/compat.js";
import { adminRidersRepository } from "../services/postgres/adminRiders.repository.js";
import { riderSelfRepository } from "../services/postgres/riderSelf.repository.js";
import { usePostgresWalletReads } from "../services/postgres/compat.js";
import { walletRepository } from "../services/postgres/wallet.repository.js";

export const createRider = async (req, res, next) => {
    try {
        const vendorId = req.params.vendorId || null;
        const rider = await riderService.createRider(
            { ...req.body, isVerified: false },
            vendorId
        );
        res.status(201).json({ success: true, data: rider.getPublicProfile() });
    } catch (error) {
        next(error);
    }
};

export const registerRider = async (req, res, next) => {
    try {
        const {
            name,
            phone,
            email,
            password,
            stateId,
            cityId,
            state,
            city,
            requestedState,
            requestedCity,
            serviceZones,
            vehicleType,
            payoutDetails,
        } = req.body;

        const stateName = (requestedState || state || "").trim();
        const cityName = (requestedCity || city || "").trim();
        const hasKnownLocation = Boolean(stateId && cityId);
        const hasRequestedLocation = Boolean(stateName && cityName);

        if (!name || !phone || !password || (!hasKnownLocation && !hasRequestedLocation)) {
            return res.status(400).json({
                success: false,
                message: "Name, phone, password, state and city are required",
            });
        }

        let locationData = {
            stateId: hasKnownLocation ? stateId : null,
            cityId: hasKnownLocation ? cityId : null,
            locationStatus: hasKnownLocation ? "approved" : null,
            requestedState: "",
            requestedCity: "",
        };

        if (hasRequestedLocation) {
            locationData = await validateVendorLocation(stateName, cityName);
        }

        const rider = await riderService.createRider({
            name,
            phone,
            email: email || undefined,
            password,
            stateId: locationData.stateId,
            cityId: locationData.cityId,
            locationStatus: locationData.locationStatus,
            requestedState: locationData.requestedState || "",
            requestedCity: locationData.requestedCity || "",
            serviceZones: Array.isArray(serviceZones)
                ? serviceZones
                : (locationData.requestedCity ? [locationData.requestedCity] : []),
            vehicleOwnership: "own",
            vehicleType: ["bicycle", "motorbike"].includes(vehicleType) ? vehicleType : "motorbike",
            isVerified: false,
            payoutDetails: payoutDetails || undefined,
        });

        res.status(201).json({
            success: true,
            message: "Rider account registered successfully. Your account is pending admin approval.",
            data: rider.getPublicProfile(),
        });
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
        // If it's a vendor-managed fleet request, return all active riders
        // Vendors manually manage their fleet and need to see all riders for manual assignment.
        const riders = await riderService.getRidersByVendor(vendorId, { isActive: true });
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
                note: order.note,
                payout: 600
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
            const { 
                sendRiderNotification, 
                sendVendorNotification, 
                sendOrderNotification 
            } = await import("../services/notification.service.js");

            // 1. Notify Rider
            await sendRiderNotification(rider._id, order._id, "order_assigned", {
                restaurantName: req.vendor.storeName,
                orderDatabaseId: order._id,
                payout: 600
            });

            // 2. Notify Vendor (Push)
            await sendVendorNotification(vendorId, order._id, "vendor_rider_assigned", {
                orderId: order.orderId,
                riderName: rider.name,
                orderDatabaseId: order._id
            });

            // 3. Notify Customer (Push)
            await sendOrderNotification(order.userId, order._id, "rider_assigned", {
                orderId: order.orderId,
                restaurantName: req.vendor.storeName
            });

            console.log(`✅ Assignment notifications + push sent to all parties for Order: ${order.orderId}`);
        } catch (notifErr) {
            console.warn('⚠️ Push/Notification service failed for rider assignment:', notifErr.message);
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
        if (!req.rider || req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const order = usePostgresRiderReads()
            ? await riderSelfRepository.getActiveOrder(riderId)
            : await riderService.getActiveOrder(riderId);
        
        let deliveryOtp = null;
        if (order) {
            deliveryOtp = await getActiveDeliveryOTP(order._id);
        }

        // ✅ FIX: Returning 200 with null instead of 404.
        // A 404 in the console looks like a "failure" to the user/dev, 
        // but having no active order is a valid and frequent state for a rider.
        res.status(200).json({ 
            success: true, 
            data: { order: order ? { ...order, deliveryOtp } : null } 
        });
    } catch (error) {
        next(error);
    }
};

export const getPendingOffers = async (req, res, next) => {
    try {
        const { riderId } = req.params;
        if (!req.rider || req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const offers = usePostgresRiderReads()
            ? await riderSelfRepository.getPendingOffers(riderId)
            : await riderService.getPendingOffers(riderId);
        
        res.status(200).json({ 
            success: true, 
            data: { offers } 
        });
    } catch (error) {
        next(error);
    }
};

export const getRiderOrderDetails = async (req, res, next) => {
    try {
        const { riderId, orderId } = req.params;

        if (!req.rider || req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Unauthorized to view this order" });
        }

        if (usePostgresRiderReads()) {
            const orderObj = await riderSelfRepository.getOrderDetails(riderId, orderId);
            if (!orderObj) {
                return res.status(404).json({ success: false, message: "Order not found" });
            }

            const deliveryOtp = await getActiveDeliveryOTP(orderId);
            return res.status(200).json({ success: true, data: { ...orderObj, deliveryOtp } });
        }

        // 1. Fetch Basic Order first for Auth Check
        const order = await Order.findById(orderId).select("riderId orderStatus");
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        // 2. Auth Guard: Allow if rider is assigned owner OR an offered candidate
        const isAssignedOwner = order.riderId?.toString() === riderId;
        let isCandidate = false;

        if (!isAssignedOwner) {
            isCandidate = await RiderAssignment.exists({
                riderId: new mongoose.Types.ObjectId(riderId),
                orderId: new mongoose.Types.ObjectId(orderId),
                status: "assigned",
                expiresAt: { $gt: new Date() }
            });
        }

        if (!isAssignedOwner && !isCandidate) {
            console.warn(`🚫 [getRiderOrderDetails] 403: Rider ${riderId} unauthorized for Order ${orderId}`);
            return res.status(403).json({ success: false, message: "Rider not authorized to view this order" });
        }

        // 3. Delegate detailed fetching/population to the service (same logic as dashboard)
        const orderObj = await riderService.getRiderOrderDetails(riderId, orderId);

        // 4. Check for active delivery OTP
        const deliveryOtp = await getActiveDeliveryOTP(orderId);

        res.status(200).json({ success: true, data: { ...orderObj, deliveryOtp } });
    } catch (error) {
        console.error("💥 [getRiderOrderDetails] Error:", error.message);
        next(error);
    }
};

export const updateRiderStatus = async (req, res, next) => {
    try {
        const { riderId } = req.params;
        const { status, reason, orderId: reqOrderId } = req.body;

        if (req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Unauthorized to update this rider status" });
        }

        if (usePostgresRiderAssignmentWrites() && (status === "on_delivery" || ((reason || reqOrderId) && status === "available"))) {
            const response = status === "on_delivery"
                ? await riderSelfRepository.acceptAssignment(riderId, reqOrderId)
                : await riderSelfRepository.rejectAssignment(riderId, { orderId: reqOrderId, reason, changedBy: "rider" });

            if (response.status) {
                return res.status(response.status).json({
                    success: response.success,
                    message: response.message,
                    ...(response.data ? { data: response.data } : {}),
                });
            }

            let io;
            try {
                io = getIO();
            } catch (err) {
                console.warn("Socket.IO not initialized during Postgres rider assignment update", err.message);
            }

            if (status === "on_delivery") {
                const context = response.notificationContext || {};
                if (io && context.vendorId) {
                    io.to(SOCKET_ROOMS.vendor(context.vendorId)).emit(
                        SOCKET_EVENTS.ORDER_STATUS_UPDATE,
                        buildPayload.statusUpdate({
                            orderId: context.orderDatabaseId || reqOrderId,
                            status: "rider_accepted",
                            changedBy: "rider",
                            message: `Rider ${context.riderName || req.rider.name} has accepted the delivery assignment.`,
                            riderName: context.riderName || req.rider.name
                        })
                    );
                }

                if (io) {
                    for (const losingRiderId of context.losingRiderIds || []) {
                        io.to(SOCKET_ROOMS.rider(losingRiderId)).emit(
                            SOCKET_EVENTS.ASSIGNMENT_CANCELLED,
                            buildPayload.assignmentCancelled({
                                orderId: context.orderDatabaseId || reqOrderId,
                                reason: 'accepted_by_another_rider',
                                message: 'This order has been accepted by another rider.'
                            })
                        );
                    }
                }

                try {
                    const { sendNotification } = await import("../services/notification.service.js");
                    await sendNotification(null, 'rider_assignment_accepted', {
                        orderId: context.orderId || reqOrderId,
                        orderDatabaseId: context.orderDatabaseId || reqOrderId,
                        riderName: context.riderName || req.rider.name,
                        message: `Rider ${context.riderName || req.rider.name} accepted delivery assignment for Order #${context.orderId || reqOrderId}. Order is now in transit.`
                    }, 'admin');
                } catch (notifErr) {
                    console.warn('Admin notification failed for Postgres rider accept:', notifErr.message);
                }
            } else {
                const context = response.notificationContext || {};
                for (const orderContext of context.orders || []) {
                    if (io && orderContext.vendorId && orderContext.remainingOffers === 0) {
                        io.to(SOCKET_ROOMS.vendor(orderContext.vendorId)).emit(
                            SOCKET_EVENTS.ORDER_STATUS_UPDATE,
                            buildPayload.statusUpdate({
                                orderId: orderContext.orderDatabaseId || orderContext.orderId,
                                status: context.actionStatus,
                                changedBy: "rider",
                                message: context.reason === "timeout"
                                    ? `Rider ${context.riderName || req.rider.name} did not respond before the assignment timer expired. Manual reassignment required.`
                                    : `Rider ${context.riderName || req.rider.name} rejected the assignment. Please assign another rider.`,
                                riderName: context.riderName || req.rider.name
                            })
                        );
                    }

                    try {
                        const { sendNotification } = await import("../services/notification.service.js");
                        await sendNotification(null, context.reason === "timeout" ? 'rider_assignment_timeout' : 'rider_assignment_needed', {
                            orderId: orderContext.orderId || reqOrderId,
                            orderDatabaseId: orderContext.orderDatabaseId || reqOrderId,
                            riderName: context.riderName || req.rider.name,
                            reason: context.reason,
                            message: context.reason === "timeout"
                                ? `Rider ${context.riderName || req.rider.name} did not respond to Order #${orderContext.orderId || reqOrderId}. Manual reassignment required.`
                                : `Rider ${context.riderName || req.rider.name} rejected Order #${orderContext.orderId || reqOrderId}. Manual reassignment required.`
                        }, 'admin');
                    } catch (notifErr) {
                        console.warn('Admin notification failed for Postgres rider rejection:', notifErr.message);
                    }
                }
            }

            return res.status(200).json({ success: true, data: response.data });
        }

        // ✅ FIX: Was calling getSingleRiderForVendor(riderId, req.rider?.vendorId || "dummy")
        // which queries { _id: riderId, vendorId: "dummy" } for admin-managed riders
        // → always throws "Rider not found" BEFORE the status update happens.
        // Now we fetch directly by ID, which works for all rider types.
        const oldRider = await Rider.findById(riderId).populate("currentOrderId");
        if (!oldRider) {
            return res.status(404).json({ success: false, message: "Rider not found" });
        }

        // Prevent riders from accepting another job while on an active delivery
        if (status === "on_delivery" && (oldRider.status === "on_delivery" || oldRider.currentOrderId)) {
            const isSameOrder = reqOrderId && oldRider.currentOrderId?._id?.toString() === reqOrderId.toString();
            if (!isSameOrder) {
                return res.status(400).json({
                    success: false,
                    message: "You already have an ongoing delivery. Please complete your current active delivery before accepting a new job."
                });
            }
        }

        const wasPending = oldRider.status === "pending_assignment" || oldRider.status === "available" || oldRider.status === "on_delivery";
        let orderId = reqOrderId || oldRider.currentOrderId?._id || oldRider.currentOrderId;
        if (wasPending && !orderId && status === "on_delivery") {
            const pendingAssignment = await RiderAssignment.findOne({
                riderId,
                status: "assigned",
                expiresAt: { $gt: new Date() },
            }).sort({ createdAt: -1 });
            orderId = pendingAssignment?.orderId || null;
        }

        if (status === "on_delivery" && !orderId) {
            return res.status(400).json({ success: false, message: "No active assignment found to accept." });
        }

        const rider = await riderService.updateRiderStatus(riderId, status, reason);
        
        // 🚀 NEW: Instant catch-up for newly available riders
        if (status === "available") {
            const { catchupRiderWithPendingOrders } = await import("../services/riderAssignment.service.js");
            // Run in background to not block the response
            catchupRiderWithPendingOrders(riderId).catch(err => 
                console.error(`❌ [Catch-up] Error for rider ${riderId}:`, err.message)
            );
        }

        const vendorId = rider.vendorId?.toString();

        let io;
        try {
            io = getIO();
        } catch (err) {
            console.warn("Socket.IO not initialized during rider status update", err.message);
        }

        if (wasPending && orderId) {
            if (status === "on_delivery") {
                // Resolve vendorOrder and masterOrder
                const OrderModel = (await import("../model/order/Order.js")).default;
                const VendorOrderModel = (await import("../model/vendor/VendorOrder.js")).default;

                let vendorOrder = await VendorOrderModel.findById(orderId);
                let actualOrderId = orderId;
                let masterOrder = null;

                if (vendorOrder) {
                    actualOrderId = vendorOrder.userOrderId;
                    masterOrder = await OrderModel.findById(actualOrderId);
                } else {
                    masterOrder = await OrderModel.findById(orderId);
                }

                if (!masterOrder) {
                    return res.status(404).json({ success: false, message: "Order not found" });
                }

                const acceptedOrderUpdate = await OrderModel.findOneAndUpdate(
                    {
                        _id: actualOrderId,
                        $or: [{ riderId: null }, { riderId: riderId }],
                        "riderAssignment.status": "assigned",
                    },
                    {
                        $set: {
                            riderId,
                            orderStatus: "rider_assigned",
                            "riderAssignment.status": "accepted",
                            "riderAssignment.acceptedAt": new Date(),
                            "riderAssignment.lastReason": ""
                        }
                    },
                    { new: true }
                );

                if (vendorOrder) {
                    vendorOrder.riderId = riderId;
                    vendorOrder.orderStatus = "rider_assigned";
                    await vendorOrder.save();
                }

                if (acceptedOrderUpdate) {
                    if (!acceptedOrderUpdate.statusLog) {
                        acceptedOrderUpdate.statusLog = [];
                    }
                    acceptedOrderUpdate.statusLog.push({
                        status: "rider_assigned",
                        changedBy: "rider",
                        timestamp: new Date()
                    });
                    await acceptedOrderUpdate.save();
                }

                if (!acceptedOrderUpdate) {
                    // ✅ IDEMPOTENCY CHECK: If the rider is already the owner, treat as success
                    const alreadyOwned = (masterOrder.riderId?.toString() === riderId) || (vendorOrder && vendorOrder.riderId?.toString() === riderId);
                    if (alreadyOwned) {
                        console.log(`♻️ [updateRiderStatus] Rider ${riderId} already owns Order ${orderId}. Treating as success.`);
                    } else {
                        await Rider.findByIdAndUpdate(riderId, {
                            $set: { status: "available", assignmentExpiresAt: null },
                            $unset: { currentOrderId: "" }
                        });
                        
                        const assignQuery = vendorOrder 
                            ? { riderId, vendorOrderId: vendorOrder._id, status: "assigned" }
                            : { riderId, orderId: actualOrderId, status: "assigned" };

                        await RiderAssignment.findOneAndUpdate(
                            assignQuery,
                            { $set: { status: "rejected", respondedAt: new Date(), reason: "order_already_taken" } },
                            { sort: { createdAt: -1 } }
                        );
                        return res.status(409).json({
                            success: false,
                            message: "This order has already been accepted by another rider"
                        });
                    }
                }

                await Rider.findByIdAndUpdate(riderId, {
                    $set: { status: "on_delivery", currentOrderId: orderId, assignmentExpiresAt: null }
                });

                const assignQuery = vendorOrder 
                    ? { riderId, vendorOrderId: vendorOrder._id, status: "assigned" }
                    : { riderId, orderId: actualOrderId, status: "assigned" };

                await RiderAssignment.findOneAndUpdate(
                    assignQuery,
                    { $set: { status: "accepted", respondedAt: new Date() } },
                    { sort: { createdAt: -1 } }
                );

                const losingAssignmentsQuery = vendorOrder
                    ? { vendorOrderId: vendorOrder._id, riderId: { $ne: riderId }, status: "assigned" }
                    : { orderId: actualOrderId, riderId: { $ne: riderId }, status: "assigned" };

                const losingAssignments = await RiderAssignment.find(losingAssignmentsQuery).select("riderId");
                const losingRiderIds = losingAssignments.map((assignment) => assignment.riderId);
                if (losingRiderIds.length) {
                    await RiderAssignment.updateMany(
                        losingAssignmentsQuery,
                        { $set: { status: "cancelled", respondedAt: new Date(), reason: "accepted_by_another_rider" } }
                    );
                    await Rider.updateMany(
                        { _id: { $in: losingRiderIds }, status: "pending_assignment" },
                        { $set: { status: "available", assignmentExpiresAt: null }, $unset: { currentOrderId: "" } }
                    );

                    // ✅ SYNC: Notify all other riders to close their broadcast modals immediately
                    losingRiderIds.forEach(id => {
                        const room = SOCKET_ROOMS.rider(id);
                        if (io) {
                            io.to(room).emit(SOCKET_EVENTS.ASSIGNMENT_CANCELLED, buildPayload.assignmentCancelled({
                                orderId,
                                reason: 'accepted_by_another_rider',
                                message: 'This order has been accepted by another rider.'
                            }));
                        }
                    });
                }

                const finalOrderObj = acceptedOrderUpdate || masterOrder;

                const resolvedVendorId = vendorId ||
                    finalOrderObj?.items?.[0]?.restaurantId?.toString() || null;

                // Notify vendor via socket (works for both rider types)
                if (resolvedVendorId && io) {
                    io.to(SOCKET_ROOMS.vendor(resolvedVendorId)).emit(
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

                // Notify admin — critical for platform-managed orders where admin
                // assigned the rider and needs confirmation the delivery is underway
                try {
                    const { sendNotification } = await import("../services/notification.service.js");
                    await sendNotification(null, 'rider_assignment_accepted', {
                        orderId: finalOrderObj?.orderId || orderId,
                        orderDatabaseId: orderId,
                        riderName: rider.name,
                        message: `Rider ${rider.name} accepted delivery assignment for Order #${finalOrderObj?.orderId || orderId}. Order is now in transit.`
                    }, 'admin');
                } catch (notifErr) {
                    console.warn('⚠️ Admin notification failed for rider accept:', notifErr.message);
                }

            } else if (status === "available") {
                const isTimeout = reason === "timeout";
                const actionStatus = isTimeout ? "rider_assignment_timeout" : "rider_rejected";
                const actionMessage = isTimeout
                    ? `Rider ${rider.name} did not respond before the assignment timer expired. Manual reassignment required.`
                    : `Rider ${rider.name} rejected the assignment. Please assign another rider.`;
                // ── RIDER REJECTED ────────────────────────────────────────────────
                const OrderModel = (await import("../model/order/Order.js")).default;
                const VendorOrder = (await import("../model/vendor/VendorOrder.js")).default;
                
                // Resolve vendorOrder and masterOrder
                let vendorOrder = await VendorOrder.findById(orderId);
                let actualOrderId = orderId;
                let masterOrder = null;

                if (vendorOrder) {
                    actualOrderId = vendorOrder.userOrderId;
                    masterOrder = await OrderModel.findById(actualOrderId);
                } else {
                    masterOrder = await OrderModel.findById(orderId);
                }

                if (!masterOrder) {
                    console.warn(`⚠️ Reject attempted for non-existent order ${orderId}`);
                    return res.status(200).json({ success: true, data: rider.getPublicProfile() });
                }

                const previousOrder = masterOrder;

                const rejectAssignmentQuery = vendorOrder 
                    ? { riderId, vendorOrderId: vendorOrder._id, status: { $in: ["assigned", "accepted"] } }
                    : { riderId, orderId: actualOrderId, status: { $in: ["assigned", "accepted"] } };

                await RiderAssignment.findOneAndUpdate(
                    rejectAssignmentQuery,
                    {
                        $set: {
                            status: isTimeout ? "timeout" : "rejected",
                            respondedAt: new Date(),
                            reason: isTimeout ? "timeout" : "rejected"
                        }
                    },
                    { sort: { createdAt: -1 } }
                );

                const remainingOffersQuery = vendorOrder
                    ? { vendorOrderId: vendorOrder._id, status: "assigned", expiresAt: { $gt: new Date() } }
                    : { orderId: actualOrderId, status: "assigned", expiresAt: { $gt: new Date() } };

                const remainingOffers = await RiderAssignment.countDocuments(remainingOffersQuery);

                const order = remainingOffers > 0
                    ? masterOrder
                    : await OrderModel.findByIdAndUpdate(
                        actualOrderId,
                        {
                            orderStatus: "ready_for_pickup",
                            riderId: null,
                            riderAssignment: {
                                status: isTimeout ? "timeout" : "rejected",
                                assignedAt: previousOrder?.riderAssignment?.assignedAt || null,
                                acceptedAt: null,
                                rejectedAt: new Date(),
                                expiresAt: null,
                                lastReason: isTimeout ? "timeout" : "rejected",
                                assignedBy: previousOrder?.riderAssignment?.assignedBy || null
                            },
                            $push: {
                                statusLog: {
                                    status: actionStatus,
                                    changedBy: "rider",
                                    timestamp: new Date()
                                }
                            }
                        },
                        { new: true }
                    );

                if (order) {
                    // Resolve vendorId from the order for admin-managed riders
                    const resolvedVendorId = vendorId ||
                        order.items?.[0]?.restaurantId?.toString() || null;

                    // Update VendorOrder back to ready_for_pickup
                    if (remainingOffers === 0) {
                        if (vendorOrder) {
                            vendorOrder.orderStatus = "ready_for_pickup";
                            await vendorOrder.save();
                        } else {
                            await VendorOrder.updateMany(
                                { userOrderId: order._id },
                                { $set: { orderStatus: "ready_for_pickup" } }
                            );
                        }
                    }

                    // Notify vendor via socket
                    if (resolvedVendorId && io) {
                        io.to(SOCKET_ROOMS.vendor(resolvedVendorId)).emit(
                            SOCKET_EVENTS.ORDER_STATUS_UPDATE,
                            buildPayload.statusUpdate({
                                orderId: actualOrderId,
                                status: actionStatus,
                                changedBy: "rider",
                                message: actionMessage,
                                riderName: rider.name
                            })
                        );
                    }

                    // Notify admin — urgent for platform-managed orders, admin must
                    // reassign a rider manually. rider_assignment_needed triggers the
                    // high-priority alert config in notification.service.js.
                    try {
                        const { sendNotification } = await import("../services/notification.service.js");
                        await sendNotification(null, isTimeout ? 'rider_assignment_timeout' : 'rider_assignment_needed', {
                            orderId: order.orderId || orderId,
                            orderDatabaseId: orderId,
                            riderName: rider.name,
                            reason: isTimeout ? "timeout" : "rejected",
                            additionalData: {
                                orderDatabaseId: orderId,
                                riderId: rider._id,
                                riderName: rider.name,
                                reason: isTimeout ? "timeout" : "rejected"
                            },
                            message: isTimeout
                                ? `Rider ${rider.name} did not respond to Order #${order.orderId}. Manual reassignment required.`
                                : `Rider ${rider.name} rejected Order #${order.orderId}. Manual reassignment required.`
                        }, 'admin');
                    } catch (notifErr) {
                        console.warn('⚠️ Admin notification failed for rider rejection:', notifErr.message);
                    }
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

        if (req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Unauthorized to update this order" });
        }

        const order = usePostgresRiderAssignmentWrites()
            ? await riderSelfRepository.markPickedUp(orderId, riderId)
            : await riderService.markPickedUp(orderId, riderId);

        // Resolve vendorId from order items — handles admin-managed riders
        // where req.rider.vendorId is null
        const pickupVendorId = (order.items?.[0]?.restaurantId || order.vendorId)?.toString() || null;

        // Emit real-time status update to customer tracking page
        try {
            const io = getIO();
            io.to(SOCKET_ROOMS.customer(order.userId)).emit(
                SOCKET_EVENTS.ORDER_STATUS_UPDATE,
                buildPayload.statusUpdate({
                    orderId: order._id,
                    status: "out_for_delivery",
                    changedBy: "rider",
                    message: `${req.rider.name} has picked up your order and is on the way!`,
                    riderName: req.rider.name,
                    rider: req.rider.getPublicProfile ? req.rider.getPublicProfile() : req.rider
                })
            );
        } catch (socketErr) {
            console.warn('⚠️ Socket emit failed for customer pickup notification:', socketErr.message);
        }

        // Emit real-time status update to vendor dashboard
        // Without this, vendor sees order stuck at rider_assigned until they refresh.
        try {
            const io = getIO();
            if (pickupVendorId) {
                io.to(SOCKET_ROOMS.vendor(pickupVendorId)).emit(
                    SOCKET_EVENTS.ORDER_STATUS_UPDATE,
                    buildPayload.statusUpdate({
                        orderId: order._id,
                        status: "out_for_delivery",
                        changedBy: "rider",
                        message: `Rider ${req.rider.name} has picked up the order and is on the way!`,
                        riderName: req.rider.name,
                    })
                );
            }
        } catch (socketErr) {
            console.warn('⚠️ Socket emit failed for vendor pickup notification:', socketErr.message);
        }

        // Notify customer, vendor (push/in-app), and admin
        try {
            const {
                sendOrderNotification,
                sendVendorNotification,
                sendNotification
            } = await import("../services/notification.service.js");

            // 1. Customer push/in-app
            await sendOrderNotification(order.userId, order._id, "out_for_delivery", {
                orderId: order.orderId || order._id,
                restaurantName: order.restaurantName || "the restaurant"
            });

            // 2. Vendor push/in-app
            if (pickupVendorId) {
                await sendVendorNotification(pickupVendorId, order._id, "system", {
                    orderId: order.orderId || order._id,
                    title: 'Order Picked Up',
                    message: `Rider ${req.rider.name} has picked up the order and is on the way to the customer.`
                });
            }

            // 3. Admin notification — platform visibility on delivery progress
            await sendNotification(null, 'admin_order_ready', {
                orderId: order.orderId || order._id,
                orderDatabaseId: order._id,
                restaurantName: pickupVendorId || 'the store',
                message: `Rider ${req.rider.name} picked up Order #${order.orderId} — now out for delivery.`
            }, 'admin');

        } catch (notifErr) {
            console.warn('⚠️ Push/Notification service failed for pick-up:', notifErr.message);
        }

        res.status(200).json({ success: true, message: "Order picked up", data: order });
    } catch (error) {
        next(error);
    }
};

/**
 * STEP 1: Rider requests OTP to be sent to customer
 * Called when rider taps "Delivered" button
 * POST /riders/:riderId/request-delivery-otp
 */
export const requestDeliveryOTP = async (req, res, next) => {
    try {
        const { riderId } = req.params;
        const { orderId } = req.body;

        if (!orderId) {
            return res.status(400).json({ success: false, message: 'orderId is required' });
        }

        // Auth guard
        if (req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        const VendorOrderModel = (await import("../model/vendor/VendorOrder.js")).default;
        const vendorOrder = await VendorOrderModel.findById(orderId);
        const actualOrderId = vendorOrder ? vendorOrder.userOrderId : orderId;

        // Fetch order to get customer phone
        const order = await Order.findById(actualOrderId)
            .populate('userId', 'email firstname');

        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const isAssigned = (order.riderId?.toString() === riderId) || (vendorOrder && vendorOrder.riderId?.toString() === riderId);
        if (!isAssigned) {
            return res.status(403).json({ success: false, message: 'Rider not assigned to this order' });
        }

        const currentStatus = vendorOrder ? vendorOrder.orderStatus : order.orderStatus;
        if (currentStatus !== 'out_for_delivery' && currentStatus !== 'picked_up') {
            return res.status(400).json({
                success: false,
                message: `Delivery OTP can only be requested after the order has been picked up. Current status: ${currentStatus}`
            });
        }

        // Resolve customer phone — delivery address phone takes priority
        const customerPhone = order.deliveryAddress?.phone || order.phone;

        if (!customerPhone && !order.userId?.email) {
            return res.status(400).json({
                success: false,
                message: 'Customer has no phone or email on file — cannot send OTP'
            });
        }

        let result;
        try {
            result = await sendDeliveryOTP(
                actualOrderId,
                customerPhone,
                order.userId?._id || order.userId
            );
        } catch (otpErr) {
            // OTP delivery failed via both SMS and email
            // Return 503 so the message passes through the global error handler
            // and the rider sees a human-readable error instead of "Internal Server Error"
            return res.status(503).json({
                success: false,
                message: 'Unable to send OTP to customer right now. Check the customer has a valid phone number or email, then try again.',
            });
        }

        // Emit socket events for real-time updates
        const io = getIO(req);
        
        // 1. Notify Customer - Send the OTP so it appears on their track-order page
        const deliveryOtp = await getActiveDeliveryOTP(actualOrderId);
        io.to(SOCKET_ROOMS.customer(order.userId?._id || order.userId)).emit(
            SOCKET_EVENTS.ORDER_STATUS_UPDATE,
            buildPayload.statusUpdate({
                orderId: order._id,
                status: currentStatus,
                deliveryOtp: deliveryOtp,
                message: 'Delivery code has been sent. Please provide it to your rider upon arrival.'
            })
        );

        // 2. Notify Rider - To refresh their active order data with the OTP presence
        io.to(SOCKET_ROOMS.rider(riderId)).emit(
            SOCKET_EVENTS.ORDER_STATUS_UPDATE,
            buildPayload.statusUpdate({
                orderId: order._id,
                status: currentStatus,
                deliveryOtp: deliveryOtp,
                message: 'Delivery code sent to customer.'
            })
        );

        return res.status(200).json({
            success: true,
            message: result.method === 'sms'
                ? 'OTP sent to customer via SMS'
                : result.method === 'email'
                    ? 'OTP sent to customer via Email'
                    : 'System is in Bypass Mode — use code 123456',
            method: result.method,
        });


    } catch (error) {
        next(error);
    }
};

/**
 * STEP 2: Rider submits OTP entered by customer to confirm delivery
 * Called after customer reads code to rider
 * POST /riders/:riderId/confirm-delivery
 */
export const confirmDelivery = async (req, res, next) => {
    try {
        const { riderId } = req.params;
        const { orderId, otp } = req.body;

        if (!orderId || !otp) {
            return res.status(400).json({
                success: false,
                message: 'orderId and otp are required'
            });
        }

        // Auth guard
        if (req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        const VendorOrderModel = (await import("../model/vendor/VendorOrder.js")).default;
        const vendorOrder = await VendorOrderModel.findById(orderId);
        const actualOrderId = vendorOrder ? vendorOrder.userOrderId : orderId;

        // Verify OTP
        const { verified } = await verifyDeliveryOTP(actualOrderId, otp.toString().trim());

        if (!verified) {
            return res.status(400).json({
                success: false,
                message: 'Incorrect code. Please ask the customer to check again.'
            });
        }

        // OTP verified — proceed with delivery confirmation
        // markDelivered now returns a structured result, not raw order
        const { order, payoutCredited, isVendorManagedDelivery, payoutBlockedReason, escrowReleaseFailures = [] } = usePostgresRiderAssignmentWrites()
            ? await riderSelfRepository.markDelivered(actualOrderId, riderId)
            : await riderService.markDelivered(actualOrderId, riderId);

        // Emit real-time status update to customer tracking page
        try {
            const io = getIO();
            io.to(SOCKET_ROOMS.customer(order.userId)).emit(
                SOCKET_EVENTS.ORDER_STATUS_UPDATE,
                buildPayload.statusUpdate({
                    orderId: order._id,
                    status: "delivered",
                    changedBy: "rider",
                    message: "Your order has been delivered. Enjoy your meal!",
                    riderName: req.rider.name,
                })
            );
        } catch (socketErr) {
            console.warn('⚠️ Socket emit failed for confirmDelivery:', socketErr.message);
        }

        // ✅ Multi-party Notification Cascade (User, Vendor, Admin, Rider)
        try {
            const {
                sendOrderNotification,
                sendVendorNotification,
                sendNotification,
                sendRiderNotification,          // ← was missing, caused ReferenceError on every delivery
            } = await import('../services/notification.service.js');

            // 1. Notify customer
            await sendOrderNotification(order.userId, order._id, 'delivered', {
                orderId: order.orderId || order._id,
                restaurantName: order.restaurantName || 'the restaurant'
            });

            // 2. Notify every vendor whose items were in this order
            // Single-vendor enforcement means this runs once in practice,
            // but the loop is structurally correct.
            const uniqueVendorIds = [...new Set(
                (order.items || []).map(i => String(i.restaurantId)).filter(Boolean)
            )];
            for (const vendorId of uniqueVendorIds) {
                // Push/in-app notification
                await sendVendorNotification(
                    vendorId,
                    order._id,
                    'vendor_order_delivered',
                    {
                        orderId: order.orderId || order._id,
                        customerName: order.deliveryAddress?.name || 'the customer'
                    }
                );

                // Direct socket room emit for real-time vendor dashboard update.
                // sendVendorNotification handles push and DB but does not emit
                // to the vendor socket room — without this, the vendor dashboard
                // stays on out_for_delivery until they manually refresh.
                try {
                    const io = getIO();
                    io.to(SOCKET_ROOMS.vendor(vendorId)).emit(
                        SOCKET_EVENTS.ORDER_STATUS_UPDATE,
                        buildPayload.statusUpdate({
                            orderId: order._id,
                            status: "delivered",
                            changedBy: "rider",
                            message: `Order delivered to ${order.deliveryAddress?.name || 'the customer'}.`,
                            riderName: req.rider.name,
                        })
                    );
                } catch (socketErr) {
                    console.warn('⚠️ Socket emit failed for vendor delivery notification:', socketErr.message);
                }
            }

            // 3. Notify admin
            await sendNotification(null, 'admin_order_delivered', {
                orderId: order.orderId || order._id,
                restaurantName: order.restaurantName || 'the store'
            }, 'admin');

            if (payoutBlockedReason) {
                await sendNotification(null, 'admin_insufficient_funds', {
                    riderPayout: order.riderEarnings || 0,
                    orderId: order.orderId || order._id,
                    orderDatabaseId: order._id,
                    reason: payoutBlockedReason
                }, 'admin');
            }

            for (const escrowFailure of escrowReleaseFailures) {
                await sendNotification(null, 'admin_insufficient_funds', {
                    riderPayout: escrowFailure.amount || 0,
                    orderId: order.orderId || order._id,
                    orderDatabaseId: order._id,
                    vendorOrderId: escrowFailure.vendorOrderId,
                    reason: escrowFailure.reason
                }, 'admin');
            }

            // 4. Notify rider — only if payout was platform-managed AND actually credited.
            // Vendor-managed riders are paid cash by the vendor — no wallet credit occurs.
            // If admin wallet was insufficient, payout was staged for manual review — do not
            // tell the rider their wallet was credited when it wasn't.
            if (!isVendorManagedDelivery) {
                if (payoutCredited) {
                    await sendRiderNotification(riderId, order._id, 'rider_payout_credited', {
                        orderId: order.orderId || order._id,
                        payout: 600
                    });
                } else {
                    // Payout was blocked (admin wallet underfunded) — honest notification
                    console.warn(`⚠️ Rider payout not credited for Order ${order.orderId} — sending pending notification`);
                    await sendRiderNotification(riderId, order._id, 'order_assigned', {
                        orderId: order.orderId || order._id,
                        restaurantName: 'the restaurant',
                        payout: 0,
                    });
                }
            }
            // If isVendorManagedDelivery — no payout notification. Rider was paid cash.

        } catch (notifErr) {
            // Non-fatal — delivery already confirmed
            console.warn('⚠️ Notification cascade failed after delivery:', notifErr.message);
        }

        return res.status(200).json({
            success: true,
            message: 'Order delivered successfully',
            data: order
        });

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

export const riderUpdateSelf = async (req, res, next) => {
    try {
        const { riderId } = req.params;
        if (req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Unauthorized to update this profile" });
        }
        const rider = await riderService.riderUpdateSelf(riderId, req.body);
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
        if (usePostgresAdminRiderReads()) {
            const response = await adminRidersRepository.listRiders(req.query);
            return res.status(200).json(response);
        }

        const riders = await riderService.getAllRiders(req.query);
        res.status(200).json({ success: true, count: riders.length, data: riders });
    } catch (error) {
        next(error);
    }
};

export const adminUpdateRider = async (req, res, next) => {
    try {
        const { riderId } = req.params;
        const rider = await riderService.adminUpdateRider(riderId, {
            ...req.body,
            approvedBy: req.admin?._id
        });
        res.status(200).json({ success: true, data: rider });
    } catch (error) {
        next(error);
    }
};

export const adminApproveRider = async (req, res, next) => {
    try {
        const { riderId } = req.params;
        const rider = await riderService.adminApproveRider(riderId, req.admin?._id);
        res.status(200).json({
            success: true,
            message: "Rider approved and can now access the rider app",
            data: rider
        });
    } catch (error) {
        next(error);
    }
};

export const adminGetAssignmentHistory = async (req, res, next) => {
    try {
        if (usePostgresAdminRiderReads()) {
            const response = await adminRidersRepository.listAssignmentHistory(req.query);
            return res.status(200).json(response);
        }

        const assignments = await riderService.getAssignmentHistory(req.query);
        res.status(200).json({ success: true, count: assignments.length, data: assignments });
    } catch (error) {
        next(error);
    }
};

export const adminGetRiderHistory = async (req, res, next) => {
    try {
        const { riderId } = req.params;
        const history = await riderService.getRiderHistorySummary(riderId, req.query);
        res.status(200).json({ success: true, data: history });
    } catch (error) {
        next(error);
    }
};

export const adminGetPlatformVehicles = async (req, res, next) => {
    try {
        if (usePostgresAdminRiderReads()) {
            const response = await adminRidersRepository.listPlatformVehicles(req.query);
            return res.status(200).json(response);
        }

        const query = {};
        if (req.query.status) query.status = req.query.status;
        if (req.query.vehicleType) query.vehicleType = req.query.vehicleType;
        if (req.query.cityId) query.cityId = req.query.cityId;
        if (req.query.available === "true") {
            query.status = "available";
            query.assignedRiderId = null;
        }
        const vehicles = await PlatformVehicle.find(query)
            .sort({ createdAt: -1 })
            .populate("stateId", "name")
            .populate("cityId", "name")
            .populate("assignedRiderId", "name phone");
        res.status(200).json({ success: true, data: vehicles });
    } catch (error) {
        next(error);
    }
};

export const adminCreatePlatformVehicle = async (req, res, next) => {
    try {
        const vehicle = await PlatformVehicle.create(req.body);
        res.status(201).json({ success: true, data: vehicle });
    } catch (error) {
        next(error);
    }
};

export const adminUpdatePlatformVehicle = async (req, res, next) => {
    try {
        const vehicle = await PlatformVehicle.findByIdAndUpdate(req.params.vehicleId, req.body, {
            new: true,
            runValidators: true,
        });
        if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });
        res.status(200).json({ success: true, data: vehicle });
    } catch (error) {
        next(error);
    }
};

export const adminDeletePlatformVehicle = async (req, res, next) => {
    try {
        const { vehicleId } = req.params;
        const vehicle = await PlatformVehicle.findById(vehicleId);
        if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });

        if (vehicle.assignedRiderId) {
            // Unassign rider first
            await Rider.findByIdAndUpdate(vehicle.assignedRiderId, {
                platformVehicleId: null,
                vehicleOwnership: "own"
            });
        }

        await vehicle.deleteOne();
        res.status(200).json({ success: true, message: "Vehicle deleted successfully" });
    } catch (error) {
        next(error);
    }
};

export const adminUnassignRiderFromVehicle = async (req, res, next) => {
    try {
        const { vehicleId } = req.params;
        const vehicle = await PlatformVehicle.findById(vehicleId);
        if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });

        if (vehicle.assignedRiderId) {
            await Rider.findByIdAndUpdate(vehicle.assignedRiderId, {
                platformVehicleId: null,
                vehicleOwnership: "own"
            });
        }

        vehicle.assignedRiderId = null;
        vehicle.status = "available";
        await vehicle.save();

        res.status(200).json({ success: true, message: "Rider unassigned successfully", data: vehicle });
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

export const adminRejectRiderAssignment = async (req, res, next) => {
    try {
        const { riderId } = req.params;
        const { reason } = req.body;

        if (usePostgresRiderAssignmentWrites()) {
            const response = await riderSelfRepository.rejectAssignment(riderId, { reason: reason || "rejected_by_admin", changedBy: "admin" });

            if (response.status) {
                return res.status(response.status).json({
                    success: response.success,
                    message: response.message,
                    ...(response.data ? { data: response.data } : {}),
                });
            }

            let io;
            try { io = getIO(); } catch (e) {}

            const context = response.notificationContext || {};
            for (const orderContext of context.orders || []) {
                if (io && orderContext.vendorId && orderContext.remainingOffers === 0) {
                    io.to(SOCKET_ROOMS.vendor(orderContext.vendorId)).emit(
                        SOCKET_EVENTS.ORDER_STATUS_UPDATE,
                        buildPayload.statusUpdate({
                            orderId: orderContext.orderDatabaseId || orderContext.orderId,
                            status: "rider_rejected",
                            changedBy: "admin",
                            message: `Rider ${context.riderName}'s offer was rejected by admin. Manual reassignment required.`,
                            riderName: context.riderName
                        })
                    );
                }
            }

            if (io) {
                io.to(SOCKET_ROOMS.rider(riderId)).emit(
                    SOCKET_EVENTS.ASSIGNMENT_CANCELLED,
                    buildPayload.assignmentCancelled({
                        orderId: context.orders?.[0]?.orderDatabaseId || context.orders?.[0]?.orderId,
                        reason: 'rejected_by_admin',
                        message: 'This assignment was cancelled by an admin.'
                    })
                );
            }

            return res.status(200).json({
                success: true,
                message: "Offer rejected successfully. Rider is now available.",
                data: response.data
            });
        }

        const Rider = (await import("../model/rider.model.js")).default;
        const RiderAssignment = (await import("../model/riderAssignment.model.js")).default;
        const OrderModel = (await import("../model/order/Order.js")).default;
        const VendorOrder = (await import("../model/vendor/VendorOrder.js")).default;
        const { getIO, SOCKET_ROOMS, SOCKET_EVENTS } = await import("../socket/socketServer.js");
        const { buildPayload } = await import("../socket/rider.events.js");

        const rider = await Rider.findById(riderId);
        if (!rider) return res.status(404).json({ success: false, message: "Rider not found" });

        if (rider.status !== "pending_assignment") {
            return res.status(400).json({ success: false, message: "Rider does not have a pending assignment to reject" });
        }

        const activeAssignments = await RiderAssignment.find({
            riderId,
            status: "assigned",
            expiresAt: { $gt: new Date() }
        });

        if (!activeAssignments.length) {
            rider.status = "available";
            rider.currentOrderId = null;
            rider.assignmentExpiresAt = null;
            await rider.save();
            return res.status(400).json({ success: false, message: "No active assignment found for this rider, marked as available" });
        }

        const assignmentIds = activeAssignments.map(a => a._id);
        const orderIds = activeAssignments.map(a => a.orderId);
        const vendorId = rider.vendorId?.toString();

        await RiderAssignment.updateMany(
            { _id: { $in: assignmentIds } },
            { $set: { status: "rejected", respondedAt: new Date(), reason: reason || "rejected_by_admin" } }
        );

        rider.status = "available";
        rider.currentOrderId = null;
        rider.assignmentExpiresAt = null;
        await rider.save();

        for (const orderId of orderIds) {
            const remainingOffers = await RiderAssignment.countDocuments({
                orderId,
                status: "assigned",
                expiresAt: { $gt: new Date() }
            });

            const previousOrder = await OrderModel.findById(orderId).select("riderAssignment items orderId");

            let order = remainingOffers > 0
                ? await OrderModel.findById(orderId)
                : await OrderModel.findByIdAndUpdate(
                    orderId,
                    {
                        orderStatus: "ready_for_pickup",
                        riderId: null,
                        riderAssignment: {
                            status: "rejected",
                            assignedAt: previousOrder?.riderAssignment?.assignedAt || null,
                            acceptedAt: null,
                            rejectedAt: new Date(),
                            expiresAt: null,
                            lastReason: "rejected_by_admin",
                            assignedBy: previousOrder?.riderAssignment?.assignedBy || null
                        },
                        $push: {
                            statusLog: {
                                status: "rider_rejected",
                                changedBy: "admin",
                                timestamp: new Date()
                            }
                        }
                    },
                    { new: true }
                );

            if (order && remainingOffers === 0) {
                await VendorOrder.updateMany(
                    { userOrderId: order._id },
                    { $set: { orderStatus: "ready_for_pickup" } }
                );
            }
            
            // Note: Socket logic could be moved into loop if needed, but for now we process state cleanly.
        }

        let io;
        try { io = getIO(); } catch (e) {}

        const resolvedVendorId = vendorId || previousOrder?.items?.[0]?.restaurantId?.toString() || null;

        if (io && resolvedVendorId && remainingOffers === 0) {
            io.to(SOCKET_ROOMS.vendor(resolvedVendorId)).emit(
                SOCKET_EVENTS.ORDER_STATUS_UPDATE,
                buildPayload.statusUpdate({
                    orderId,
                    status: "rider_rejected",
                    changedBy: "admin",
                    message: `Rider ${rider.name}'s offer was rejected by admin. Manual reassignment required.`,
                    riderName: rider.name
                })
            );
        }

        if (io && vendorId) {
            io.to(SOCKET_ROOMS.vendor(vendorId)).emit(
                SOCKET_EVENTS.RIDER_STATUS_CHANGED,
                buildPayload.riderStatusChanged({
                    riderId: rider._id,
                    riderName: rider.name,
                    status: rider.status
                })
            );
        }

        if (io) {
            io.to(SOCKET_ROOMS.rider(riderId)).emit(
                SOCKET_EVENTS.ASSIGNMENT_CANCELLED,
                buildPayload.assignmentCancelled({
                    orderId,
                    reason: 'rejected_by_admin',
                    message: 'This assignment was cancelled by an admin.'
                })
            );
        }

        const { catchupRiderWithPendingOrders } = await import("../services/riderAssignment.service.js");
        catchupRiderWithPendingOrders(riderId).catch(err => 
            console.error(`❌ [Catch-up] Error for rider ${riderId}:`, err.message)
        );

        res.status(200).json({ success: true, message: "Offer rejected successfully. Rider is now available.", data: rider.getPublicProfile() });

    } catch (error) {
        next(error);
    }
};

export const getRiderWallet = async (req, res, next) => {
    try {
        const { riderId } = req.params;

        if (req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Unauthorized to view this wallet" });
        }

        if (usePostgresWalletReads()) {
            const response = await walletRepository.getRiderWallet(riderId);
            return res.status(200).json(response);
        }

        const wallet = await riderService.getRiderWallet(riderId);
        res.status(200).json({ success: true, data: wallet });
    } catch (error) {
        next(error);
    }
};

/**
 * Get all orders assigned to or delivered by a specific rider
 */
export const getRiderOrders = async (req, res, next) => {
    try {
        const { riderId } = req.params;

        // Auth guard — rider can only fetch their own orders
        if (req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        if (usePostgresRiderReads()) {
            const orders = await riderSelfRepository.listOrders(riderId);
            return res.status(200).json({ success: true, orders });
        }

        const Order = (await import("../model/order/Order.js")).default;
        
        // Find all orders where this rider is or was assigned
        const orders = await Order.find({ riderId })
            .populate("items.restaurantId", "storeName logo")
            .sort({ createdAt: -1 })
            .lean();

        // Enrich with simplified status for frontend
        const enrichedOrders = orders.map(order => {
            let status = order.orderStatus;
            
            // Map backend statuses to consolidated frontend statuses if needed
            if (["delivered", "completed"].includes(order.orderStatus)) status = "delivered";
            if (order.orderStatus === "out_for_delivery") status = "picked_up";
            if (order.orderStatus === "rider_assigned") status = "assigned";

            return {
                ...order,
                status // Frontend expects 'status' field for the tabs
            };
        });

        res.status(200).json({ success: true, orders: enrichedOrders });
    } catch (error) {
        next(error);
    }
};
