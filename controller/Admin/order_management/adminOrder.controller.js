import Order from "../../../model/order/Order.js";
import VendorOrder from "../../../model/vendor/VendorOrder.js";
import Vendor from "../../../model/vendor/vendor.model.js";
import Wallet from "../../../model/wallet/wallet.mode.js";
import User from "../../../model/user.model.js";
import Rider from "../../../model/rider.model.js";
import RiderAssignment from "../../../model/riderAssignment.model.js";
import mongoose from "mongoose";
import { getPlatformConfig } from "../../../services/platformConfig.service.js";
import { expireStaleRiderAssignmentOffers } from "../../../services/riderAssignment.service.js";

/**
 * GET ALL ORDERS
 * Route: GET /api/admin/orders
 */
export const getAllOrders = async (req, res) => {
    try {
        const {
            status,
            paymentStatus,
            vendorId,
            deliveryType,
            startDate,
            endDate,
            search,
            page = 1,
            limit = 20
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const filters = {};

        if (status) {
            if (status.includes(',')) {
                filters.orderStatus = { $in: status.split(',') };
            } else {
                filters.orderStatus = status;
            }
        }
        if (paymentStatus) filters.paymentStatus = paymentStatus;
        if (vendorId) filters["items.restaurantId"] = vendorId;
        if (startDate || endDate) {
            filters.createdAt = {};
            if (startDate) filters.createdAt.$gte = new Date(startDate);
            if (endDate) filters.createdAt.$lte = new Date(endDate);
        }

        if (search) {
            filters.$or = [
                { orderId: { $regex: search, $options: "i" } },
                { "deliveryAddress.name": { $regex: search, $options: "i" } },
                { "phone": { $regex: search, $options: "i" } }
            ];
        }

        const orders = await Order.find(filters)
            .populate("userId", "firstname lastname email phone")
            .populate("riderId", "name phone avatar status")
            .populate("items.restaurantId", "storeName logo deliveryManagedBy")
            .populate("items.foodId", "name image_url item_type")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // 🚀 NEW: Populate active assignments for logistics monitoring
        const ordersWithAssignments = await Promise.all(orders.map(async (order) => {
            const activeAssignments = await RiderAssignment.find({
                orderId: order._id,
                status: "assigned"
            }).populate("riderId", "name phone status").lean();
            return { ...order, activeAssignments };
        }));

        const total = await Order.countDocuments(filters);

        res.status(200).json({
            success: true,
            data: {
                orders: ordersWithAssignments,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET SINGLE ORDER (FULL DETAIL)
 * Route: GET /api/admin/orders/:orderId
 */
export const getSingleOrder = async (req, res) => {
    try {
        const { orderId } = req.params;

        const query = String(orderId).match(/^[0-9a-fA-F]{24}$/) 
            ? { _id: orderId } 
            : { orderId: orderId };

        let order = await Order.findOne(query)
            .populate("userId", "firstname lastname email phone")
            .populate("riderId", "name phone avatar status")
            .populate("items.restaurantId", "storeName logo deliveryManagedBy")
            .populate("items.foodId", "name image_url item_type")
            .lean();

        // Resiliency: If not found in Parent Orders, check if it's a VendorOrder (sub-order) ID.
        // Notifications often embed the sub-order ID, so gracefully resolve its parent.
        if (!order && String(orderId).match(/^[0-9a-fA-F]{24}$/)) {
            const vendorOrderFallback = await VendorOrder.findById(orderId).select("userOrderId").lean();
            if (vendorOrderFallback && vendorOrderFallback.userOrderId) {
                order = await Order.findById(vendorOrderFallback.userOrderId)
                    .populate("userId", "firstname lastname email phone")
                    .populate("riderId", "name phone avatar status")
                    .populate("items.restaurantId", "storeName logo deliveryManagedBy")
                    .populate("items.foodId", "name image_url item_type")
                    .lean();
            }
        }

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const vendorOrders = await VendorOrder.find({ userOrderId: order._id })
            .populate("restaurantId", "storeName logo")
            .lean();

        // Fetch wallets for each vendor
        const vendorIds = [...new Set(order.items.map(item => item.restaurantId._id))];
        const wallets = await Wallet.find({
            ownerId: { $in: vendorIds },
            ownerModel: "Vendor"
        }).select("ownerId balance").lean();

        // Map wallets back to vendorIDs for convenience if needed by frontend
        const walletsMap = wallets.reduce((acc, w) => {
            acc[w.ownerId.toString()] = w.balance;
            return acc;
        }, {});

        // All deliveries are platform-managed
        const deliveryType = "platform_managed";

        // Financial Summary
        const financialSummary = {
            subtotal: order.subtotal,
            totalDeliveryFee: order.deliveryFee,
            discountAmount: order.appliedDiscount?.amount || 0,
            totalCommission: vendorOrders.reduce((sum, vo) => sum + (vo.commission || 0), 0),
            totalVendorEarnings: vendorOrders.reduce((sum, vo) => sum + (vo.vendorTotal || 0), 0),
            total: order.total
        };

        res.status(200).json({
            success: true,
            data: {
                order: { ...order, deliveryType },
                vendorOrders,
                financialSummary,
                vendorWallets: walletsMap
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getOrderStats = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        // 1. Basic Counts & Revenue (Orders)
        const orderStats = await Order.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalRevenue: {
                        $sum: {
                            $cond: [{ $eq: ["$paymentStatus", "paid"] }, "$total", 0]
                        }
                    }
                }
            }
        ]);

        // 2. Commission (VendorOrders)
        const commissionStats = await VendorOrder.aggregate([
            { $match: dateFilter },
            { $group: { _id: null, totalCommission: { $sum: "$commission" } } }
        ]);

        // All deliveries are platform-managed
        const deliveryStats = await Order.aggregate([
            {
                $match: {
                    ...dateFilter,
                    paymentStatus: "paid"
                }
            },
            { $group: { _id: null, platformDeliveryRevenue: { $sum: "$deliveryFee" } } }
        ]);

        // 4. Grouped stats
        const ordersByStatus = await Order.aggregate([
            { $match: dateFilter },
            { $group: { _id: "$orderStatus", count: { $sum: 1 } } }
        ]);

        const ordersByPaymentStatus = await Order.aggregate([
            { $match: dateFilter },
            { $group: { _id: "$paymentStatus", count: { $sum: 1 } } }
        ]);

        // 5. Recent Orders
        const recentOrders = await Order.find({ paymentStatus: "paid" })
            .sort({ createdAt: -1 })
            .limit(5)
            .select("orderId total orderStatus createdAt")
            .lean();

        res.status(200).json({
            success: true,
            data: {
                totalOrders: orderStats[0]?.totalOrders || 0,
                totalRevenue: orderStats[0]?.totalRevenue || 0,
                totalCommission: commissionStats[0]?.totalCommission || 0,
                platformDeliveryRevenue: deliveryStats[0]?.platformDeliveryRevenue || 0,
                ordersByStatus: ordersByStatus.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                ordersByPaymentStatus: ordersByPaymentStatus.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {}),
                recentOrders
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * ADMIN OVERRIDE ORDER STATUS
 * Route: PATCH /api/admin/orders/:orderId/status
 */
export const adminOverrideOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status, reason } = req.body;

        if (!reason) {
            return res.status(400).json({ success: false, message: "Reason is required for admin status override" });
        }

        const validStatuses = [
            "pending", "accepted", "preparing", "ready_for_pickup",
            "rider_assigned", "out_for_delivery", "delivered",
            "completed", "cancelled", "failed", "refunded"
        ];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid order status" });
        }

        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const previousStatus = order.orderStatus;
        order.orderStatus = status;
        order.statusLog.push({
            status,
            changedBy: `admin:${req.admin._id}`,
            timestamp: new Date()
        });

        await order.save();

        await VendorOrder.updateMany(
            { userOrderId: order._id },
            { $set: { orderStatus: status } }
        );

        // ── Trigger refund when admin cancels a paid order ────────────────────────
        // Every other cancellation path calls refundOrderToWallet.
        // Admin override was the only path that bypassed it — leaving customers
        // with cancelled paid orders and no refund.
        if (status === 'cancelled' && order.paymentStatus === 'paid') {
            try {
                const { refundOrderToWallet } = await import("../../../services/refund.service.js");
                await refundOrderToWallet(order._id, 'admin_cancel');
                console.log(`✅ Admin cancel refund processed for Order ${order.orderId}`);
            } catch (refundErr) {
                // Non-fatal — status update already saved, refund logged for manual review
                console.error(`❌ Refund failed after admin cancel for Order ${order.orderId}:`, refundErr.message);
            }
        }

        // ✅ Notify Customer & Vendors (Push/In-app)
        try {
            const { sendOrderNotification, sendVendorNotification } = await import("../../../services/notification.service.js");
            
            // 1. Notify Customer
            await sendOrderNotification(order.userId, order.orderId, status, {
                orderDatabaseId: order._id,
                cancellationReason: status === 'cancelled' ? reason : undefined
            });

            // 2. Notify all Vendors in this order
            const vendorOrders = await VendorOrder.find({ userOrderId: order._id });
            for (const vo of vendorOrders) {
                await sendVendorNotification(vo.restaurantId, order._id, "system", {
                    orderId: order.orderId,
                    title: `Status Updated by Admin`,
                    message: `The status of Order #${order.orderId} has been updated to "${status}" by platform administration.`
                });
            }
        } catch (notifErr) {
            console.warn('⚠️ Admin override notifications failed:', notifErr.message);
        }

        res.status(200).json({
            success: true,
            message: "Order status updated by admin",
            data: { orderId, previousStatus, newStatus: status, reason }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET PLATFORM-MANAGED ORDERS (LOGISTICS VIEW)
 * Route: GET /api/admin/orders/platform-managed
 */
export const getPlatformManagedOrders = async (req, res) => {
    try {
        const { status, statusGroup, paymentStatus, startDate, endDate, search, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (status) {
            if (status.includes(',')) {
                filter.orderStatus = { $in: status.split(',') };
            } else {
                filter.orderStatus = status;
            }
        } else if (statusGroup === "logistics") {
            filter.orderStatus = { $in: ["ready_for_pickup", "rider_assigned"] };
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const orders = await Order.find(filter)
            .populate("userId", "firstname lastname email phone")
            .populate("riderId", "name phone avatar status")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Get vendor orders for each for context
        const ordersWithVendorContext = await Promise.all(orders.map(async (order) => {
            const vendorOrders = await VendorOrder.find({ userOrderId: order._id })
                .populate("restaurantId", "storeName logo cityId stateId")
                .lean();
            return { ...order, vendorOrders };
        }));

        const total = await Order.countDocuments(filter);

        res.status(200).json({
            success: true,
            data: {
                orders: ordersWithVendorContext,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET COMMISSION LEDGER (REVENUE VIEW)
 * Route: GET /api/admin/orders/commission-ledger
 */
export const getCommissionLedger = async (req, res) => {
    try {
        const { startDate, endDate, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const platformConfig = await getPlatformConfig();

        const dateFilter = { paymentStatus: "paid" };
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        // Aggregation to get totals and per-order data
        // This is more efficient than nested loops
        const aggregationResult = await Order.aggregate([
            { $match: dateFilter },
            {
                $lookup: {
                    from: "vendororders",
                    localField: "_id",
                    foreignField: "userOrderId",
                    as: "vOrders"
                }
            },
            {
                $lookup: {
                    from: "vendors",
                    localField: "items.restaurantId",
                    foreignField: "_id",
                    as: "vendors"
                }
            },
            {
                $project: {
                    orderId: 1,
                    createdAt: 1,
                    subtotal: 1,
                    deliveryFee: 1,
                    serviceFee: { $ifNull: ["$serviceFee", 0] },
                    riderEarnings: { $ifNull: ["$riderEarnings", platformConfig.riderFixedPayout] },
                    total: 1,
                    numberOfVendors: { $size: "$vOrders" },
                    vendorNames: "$vendors.storeName",
                    totalCommission: { $sum: "$vOrders.commission" },
                    // All delivery fees are held by the platform
                    isPlatformManaged: true
                }
            },
            {
                $addFields: {
                    deliveryFeeHeld: {
                        $cond: ["$isPlatformManaged", "$deliveryFee", 0]
                    },
                    deliverySpread: {
                        $max: [
                            0,
                            { $subtract: ["$deliveryFee", "$riderEarnings"] }
                        ]
                    },
                    platformRevenue: {
                        $add: [
                            "$totalCommission",
                            "$serviceFee",
                            {
                                $max: [
                                    0,
                                    { $subtract: ["$deliveryFee", "$riderEarnings"] }
                                ]
                            }
                        ]
                    }
                }
            },
            { $sort: { createdAt: -1 } },
            {
                $facet: {
                    metadata: [
                        {
                            $group: {
                                _id: null,
                                totalCommissionEarned: { $sum: "$totalCommission" },
                                totalDeliveryFeesHeld: { $sum: "$deliveryFeeHeld" },
                                totalDeliverySpread: { $sum: "$deliverySpread" },
                                totalServiceFees: { $sum: "$serviceFee" },
                                totalPlatformRevenue: { $sum: "$platformRevenue" },
                                totalCount: { $sum: 1 }
                            }
                        }
                    ],
                    data: [{ $skip: skip }, { $limit: parseInt(limit) }]
                }
            }
        ]);

        const metadata = aggregationResult[0].metadata[0] || {
            totalCommissionEarned: 0,
            totalDeliveryFeesHeld: 0,
            totalDeliverySpread: 0,
            totalServiceFees: 0,
            totalPlatformRevenue: 0,
            totalCount: 0
        };

        const orders = aggregationResult[0].data;

        res.status(200).json({
            success: true,
            data: {
                summary: {
                    totalCommissionEarned: metadata.totalCommissionEarned,
                    totalDeliveryFeesHeld: metadata.totalDeliveryFeesHeld,
                    totalDeliverySpread: metadata.totalDeliverySpread || 0,
                    totalServiceFees: metadata.totalServiceFees || 0,
                    combinedPlatformRevenue: metadata.totalPlatformRevenue || 0
                },
                orders,
                pagination: {
                    total: metadata.totalCount,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(metadata.totalCount / limit)
                }
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Admin assigns a rider to a platform-managed order
 * Called when vendor marks order ready_for_pickup and 
 * deliveryManagedBy === 'admin'
 * 
 * PATCH /api/admin/orders/:vendorOrderId/assign-rider
 * Body: { riderId } or { riderIds: [] }
 */
export const assignRiderToOrder = async (req, res) => {
    // Step 3: Get Socket IO Instance
    const io = req.app.get('io');
    if (!io) {
        console.warn('⚠️ Socket.IO instance not available for rider notification');
    }

    const { vendorOrderId } = req.params;
    const riderIds = Array.isArray(req.body.riderIds)
        ? req.body.riderIds
        : (req.body.riderId ? [req.body.riderId] : []);
    const uniqueRiderIds = [...new Set(riderIds.map((id) => id?.toString()).filter(Boolean))];

    // Step 4: Validation Helper
    const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

    if (!vendorOrderId || !isValidObjectId(vendorOrderId)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid vendor order ID format'
        });
    }

    if (!uniqueRiderIds.length || uniqueRiderIds.some((id) => !isValidObjectId(id))) {
        return res.status(400).json({
            success: false,
            message: 'riderId or riderIds is required and each rider must be a valid ID'
        });
    }

    try {
        // Step 2: Find the VendorOrder
        // Resiliency: Try finding by its own ID first. If not found, check if it's a Master Order ID.
        let vendorOrder = await VendorOrder.findById(vendorOrderId).populate("userOrderId");
        
        if (!vendorOrder) {
            vendorOrder = await VendorOrder.findOne({ userOrderId: vendorOrderId }).populate("userOrderId");
        }

        if (!vendorOrder) {
            return res.status(404).json({
                success: false,
                message: "No order found for assignment. Please check the order ID."
            });
        }

        const masterOrder = vendorOrder.userOrderId;
        if (!masterOrder) {
            return res.status(404).json({
                success: false,
                message: "Master order not found"
            });
        }

        const platformConfig = await getPlatformConfig();
        if (platformConfig.riderAssignmentMode === "automatic") {
            return res.status(409).json({
                success: false,
                code: "AUTOMATIC_ASSIGNMENT_ENABLED",
                message: "Automatic rider assignment is enabled. Manual rider assignment is disabled for this order."
            });
        }

        // Step 3: Validate the order is in the correct state
        const validStatuses = ['ready_for_pickup', 'ready'];
        if (!validStatuses.includes(vendorOrder.orderStatus)) {
            return res.status(400).json({
                success: false,
                message: `Order cannot be assigned a rider at this stage. Current status: ${vendorOrder.orderStatus}. Order must be ready_for_pickup before rider assignment.`
            });
        }

        // Step 4: Find and validate rider offer targets
        const riders = await Rider.find({ _id: { $in: uniqueRiderIds } });
        if (riders.length !== uniqueRiderIds.length) {
            return res.status(404).json({
                success: false,
                message: "One or more riders were not found"
            });
        }

        const inactiveRider = riders.find((rider) => !rider.isVerified);
        if (inactiveRider) {
            return res.status(400).json({
                success: false,
                message: `${inactiveRider.name || "This rider"} must be approved before dispatch`
            });
        }

        const unavailableRider = riders.find((rider) => rider.status !== 'available' || !rider.isActive || rider.deletedAt || rider.currentOrderId);
        if (unavailableRider) {
            return res.status(400).json({
                success: false,
                message: `${unavailableRider.name || "This rider"} is currently unavailable or on another delivery`
            });
        }

        await expireStaleRiderAssignmentOffers(uniqueRiderIds);

        const activeAssignments = await RiderAssignment.find({
            riderId: { $in: uniqueRiderIds },
            status: "assigned"
        }).populate("riderId", "name");
        if (activeAssignments.length) {
            const riderName = activeAssignments[0].riderId?.name || "A selected rider";
            return res.status(409).json({
                success: false,
                code: "RIDER_HAS_PENDING_ASSIGNMENT",
                message: `${riderName} already has a pending assignment offer`
            });
        }

        // Step 6: Find the Vendor
        const vendor = await Vendor.findById(vendorOrder.restaurantId).select('storeName deliveryManagedBy cityId stateId');
        const cityIdForGuard = masterOrder.deliveryAddress?.cityId || vendor?.cityId || null;
        const stateIdForGuard = masterOrder.deliveryAddress?.stateId || vendor?.stateId || null;

        if (!cityIdForGuard || !stateIdForGuard) {
            return res.status(400).json({
                success: false,
                message: "This order must have a defined city and state before assigning a rider. Verify the delivery location or vendor settings."
            });
        }

        const wrongCityRider = riders.find((rider) => rider.cityId?.toString() !== cityIdForGuard.toString());
        if (wrongCityRider) {
            return res.status(400).json({
                success: false,
                message: `${wrongCityRider.name || "This rider"} is not assigned to the same city as this order`
            });
        }

        const wrongStateRider = riders.find((rider) => rider.stateId?.toString() !== stateIdForGuard.toString());
        if (wrongStateRider) {
            return res.status(400).json({
                success: false,
                message: `${wrongStateRider.name || "This rider"} is not assigned to the same state as this order`
            });
        }

        const assignmentExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
        const riderPayout = platformConfig.riderFixedPayout || 600;
        const riderNames = riders.map((rider) => rider.name).filter(Boolean).join(", ");

        // Step 7: Lock the rider and order inside one database transaction.
        const session = await mongoose.startSession();
        session.startTransaction();
        const updatePromises = [
            // a) Update VendorOrder(s) — use updateMany to capture all vendors in the order
            VendorOrder.updateMany(
                { userOrderId: masterOrder._id },
                { $set: { orderStatus: 'rider_assigned' } },
                { session }
            ),
            // b) Update master Order
            Order.updateOne(
                { _id: masterOrder._id, riderId: null, orderStatus: { $in: ['ready_for_pickup', 'ready', 'rider_assigned'] } },
                {
                    $set: {
                        orderStatus: 'rider_assigned',
                        riderAssignment: {
                            status: 'assigned',
                            assignedAt: new Date(),
                            acceptedAt: null,
                            rejectedAt: null,
                            expiresAt: assignmentExpiresAt,
                            lastReason: '',
                            assignedBy: req.admin?._id || null
                        }
                    },
                    $push: {
                        statusLog: {
                            status: 'rider_assigned',
                            changedBy: `admin:${req.admin?._id || 'unknown'}`,
                            timestamp: new Date()
                        }
                    }
                },
                { session }
            ),
            // c) Update Rider availability
            Rider.updateMany(
                {
                    _id: { $in: uniqueRiderIds },
                    status: 'available',
                    isActive: true,
                    isVerified: true,
                    deletedAt: null,
                    currentOrderId: null,
                    ...(cityIdForGuard ? { cityId: cityIdForGuard } : {}),
                    ...(stateIdForGuard ? { stateId: stateIdForGuard } : {}),
                },
                { 
                    $set: { 
                        status: 'pending_assignment',
                        currentOrderId: masterOrder._id,
                        assignmentExpiresAt
                    } 
                },
                { session }
            )
        ];

        const results = await Promise.allSettled(updatePromises);

        // Check critical updates (a and b)
        if (
            results[0].status === 'rejected' ||
            results[1].status === 'rejected' ||
            results[2].status === 'rejected' ||
            results[1].value?.modifiedCount !== 1 ||
            results[2].value?.modifiedCount !== uniqueRiderIds.length
        ) {
            await session.abortTransaction();
            session.endSession();
            const error = results[0].reason || results[1].reason || results[2].reason;
            console.error('❌ Critical database update failed:', error.message);
            return res.status(409).json({
                success: false,
                code: "ASSIGNMENT_STATE_CONFLICT",
                message: 'Failed to assign rider to order',
                error: error?.message || "Rider or order was already assigned"
            });
        }

        if (false && results[2].status === 'rejected') {
            console.warn('⚠️ Rider availability update failed:', results[2].reason?.message);
        }

        console.log('✅ Database updates completed successfully');

        await RiderAssignment.create(uniqueRiderIds.map((targetRiderId) => ({
            orderId: masterOrder._id,
            vendorOrderId: vendorOrder._id,
            riderId: targetRiderId,
            vendorId: vendorOrder.restaurantId,
            stateId: stateIdForGuard,
            cityId: cityIdForGuard,
            status: 'assigned',
            assignedBy: req.admin?._id || null,
            expiresAt: assignmentExpiresAt,
            metadata: {
                restaurantName: vendor?.storeName || '',
                orderReadableId: masterOrder.orderId || '',
                assignmentMode: "manual"
            }
        })), { session, ordered: true });

        await session.commitTransaction();
        session.endSession();

        console.log('Rider assignment transaction committed successfully');

        // Step 8: Fire socket events (non-fatal)
        const { emitToRestaurant, emitToOrder, emitToAdmin, emitToRider } = await import("../../../socket/socketServer.js");
        const { SOCKET_EVENTS, buildPayload } = await import("../../../socket/rider.events.js");

        try {
            // a) Notify the rider immediately via socket for real-time dashboard update
            for (const rider of riders) {
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
                    assignmentMode: "manual",
                    assignmentExpiresAt
                }));
            }
            console.log(`✅ Socket: Order assigned event emitted to ${riders.length} rider(s)`);
        } catch (e) { console.error('⚠️ Socket error (rider):', e.message); }

        try {
            // ✅ Use unified notification service for real-time + push capability
            const { sendRiderNotification } = await import("../../../services/notification.service.js");
            await Promise.all(riders.map((rider) => sendRiderNotification(rider._id, masterOrder._id, "order_assigned", {
                    restaurantName: vendor?.storeName,
                    orderDatabaseId: masterOrder._id,
                    payout: riderPayout,
                    assignmentMode: "manual",
                    assignmentExpiresAt
                })
            ));
            console.log(`✅ Socket + Push: Order assigned event emitted/sent to ${riders.length} rider(s)`);
        } catch (e) { console.error('⚠️ Notification error (rider):', e.message); }

        try {
            // b) Notify the vendor
            emitToRestaurant(vendorOrder.restaurantId, 'order_status_update', {
                orderId: vendorOrder._id,
                status: 'rider_assigned',
                riderIds: uniqueRiderIds,
                riderName: riderNames,
                message: 'Rider assignment offers have been sent for your order'
            });
            console.log(`✅ Socket: Order status update emitted to vendor:${vendorOrder.restaurantId}`);
        } catch (e) { console.error('⚠️ Socket error (vendor):', e.message); }

        try {
            // c) Notify the customer
            emitToOrder(masterOrder._id, 'order_status_update', {
                orderId: masterOrder._id,
                status: 'rider_assigned',
                message: 'A rider is being assigned to your order',
                riderName: riderNames
            });
            console.log(`✅ Socket: Order status update emitted to order:${masterOrder._id}`);
        } catch (e) { console.error('⚠️ Socket error (customer):', e.message); }

        try {
            // d) Confirm to admin
            emitToAdmin(null, 'rider_assignment_confirmed', {
                vendorOrderId: vendorOrder._id,
                riderIds: uniqueRiderIds,
                riderName: riderNames,
                restaurantName: vendor?.storeName,
                confirmedAt: new Date().toISOString()
            });
            console.log('✅ Socket: Rider assignment confirmed emitted to admins');
        } catch (e) { console.error('⚠️ Socket error (admin):', e.message); }

        // Step 9: Fire push notifications (non-fatal)
        try {
            const { sendOrderNotification, sendVendorNotification } = await import("../../../services/notification.service.js");
            
            // a) Notify customer via push
            await sendOrderNotification(
                masterOrder.userId,
                masterOrder.orderId || masterOrder._id,
                'rider_assigned',
                {
                    restaurantName: vendor?.storeName,
                    orderDatabaseId: vendorOrder._id
                }
            );
            console.log('✅ Push: Customer notification sent');
        } catch (e) { console.error('⚠️ Push error (customer):', e.message); }

        try {
            const { sendVendorNotification } = await import("../../../services/notification.service.js");
            // b) Notify vendor via push
            await sendVendorNotification(
                vendorOrder.restaurantId,
                masterOrder.orderId || masterOrder._id,
                'vendor_rider_assigned',
                {
                    orderDatabaseId: vendorOrder._id,
                    riderName: riderNames
                }
            );
            console.log('✅ Push: Vendor notification sent');
        } catch (e) { console.error('⚠️ Push error (vendor):', e.message); }

        // Step 10: Return success response
        res.status(200).json({
            success: true,
            message: `${riders.length} rider assignment offer${riders.length === 1 ? "" : "s"} sent successfully`,
            data: {
                vendorOrderId: vendorOrder._id,
                orderId: masterOrder.orderId || masterOrder._id,
                riderIds: uniqueRiderIds,
                riders: riders.map((rider) => ({
                    riderId: rider._id,
                    riderName: rider.name,
                    riderPhone: rider.phone,
                })),
                status: 'rider_assigned',
                assignedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('❌ assignRiderToOrder error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to assign rider to order',
            error: error.message
        });
    }
};
