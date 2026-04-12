import Order from "../../../model/order/Order.js";
import VendorOrder from "../../../model/vendor/VendorOrder.js";
import Vendor from "../../../model/vendor/vendor.model.js";
import Wallet from "../../../model/wallet/wallet.mode.js";
import User from "../../../model/user.model.js";
import Rider from "../../../model/rider.model.js";
import mongoose from "mongoose";

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

        if (status) filters.orderStatus = status;
        if (paymentStatus) filters.paymentStatus = paymentStatus;
        if (vendorId) filters["items.restaurantId"] = vendorId;
        if (startDate || endDate) {
            filters.createdAt = {};
            if (startDate) filters.createdAt.$gte = new Date(startDate);
            if (endDate) filters.createdAt.$lte = new Date(endDate);
        }

        // deliveryType filtering requires joining with Vendor
        if (deliveryType) {
            const deliveryManagedBy = deliveryType === "platform_managed" ? "admin" : "vendor";
            const vendors = await Vendor.find({ deliveryManagedBy }).select("_id");
            const vendorIds = vendors.map(v => v._id);

            if (deliveryType === "platform_managed") {
                filters["items.restaurantId"] = { $in: vendorIds };
            } else {
                // For vendor_managed, strictly ALL vendors in order must be "vendor"
                // This is complex for a single query, so we find orders with platform vendors first
                const platformVendors = await Vendor.find({ deliveryManagedBy: "admin" }).select("_id");
                const platformVendorIds = platformVendors.map(v => v._id);
                filters["items.restaurantId"] = { $nin: platformVendorIds };
            }
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

        const total = await Order.countDocuments(filters);

        res.status(200).json({
            success: true,
            data: {
                orders,
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

        const order = await Order.findOne(query)
            .populate("userId", "firstname lastname email phone")
            .populate("riderId", "name phone avatar status")
            .populate("items.restaurantId", "storeName logo deliveryManagedBy")
            .populate("items.foodId", "name image_url item_type")
            .lean();

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

        // Determine deliveryType
        const hasPlatformVendor = order.items.some(
            item => item.restaurantId.deliveryManagedBy === "admin"
        );
        const deliveryType = hasPlatformVendor ? "platform_managed" : "vendor_managed";

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

/**
 * GET ORDER STATS (DASHBOARD SUMMARY)
 * Route: GET /api/admin/orders/stats
 */
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

        // 3. Platform Delivery Revenue
        // Note: This requires filtering orders where deliveryManagedBy is 'admin'
        // We'll approximate this by joining with vendors or checking those with admin delivery
        const adminVendors = await Vendor.find({ deliveryManagedBy: "admin" }).select("_id");
        const adminVendorIds = adminVendors.map(v => v._id);

        const deliveryStats = await Order.aggregate([
            {
                $match: {
                    ...dateFilter,
                    "items.restaurantId": { $in: adminVendorIds },
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
                orderDatabaseId: order._id
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
        const { status, paymentStatus, startDate, endDate, search, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // 1. Find platform-managed vendor IDs
        const adminVendors = await Vendor.find({ deliveryManagedBy: "admin" }).select("_id");
        const adminVendorIds = adminVendors.map(v => v._id);

        // 2. Build filters
        const filter = {
            "items.restaurantId": { $in: adminVendorIds }
        };

        if (status) filter.orderStatus = status;
        if (paymentStatus) filter.paymentStatus = paymentStatus;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        if (search) {
            filter.$or = [
                { orderId: { $regex: search, $options: "i" } },
                { "deliveryAddress.name": { $regex: search, $options: "i" } },
                { "phone": { $regex: search, $options: "i" } }
            ];
        }

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
                .populate("restaurantId", "storeName logo")
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
                    total: 1,
                    numberOfVendors: { $size: "$vOrders" },
                    totalCommission: { $sum: "$vOrders.commission" },
                    // deliveryFee is held only for vendors with deliveryManagedBy === 'admin'
                    // We check if ANY vendor in this order is platform managed
                    isPlatformManaged: {
                        $anyElementTrue: {
                            $map: {
                                input: "$vendors",
                                as: "v",
                                in: { $eq: ["$$v.deliveryManagedBy", "admin"] }
                            }
                        }
                    }
                }
            },
            {
                $addFields: {
                    deliveryFeeHeld: {
                        $cond: ["$isPlatformManaged", "$deliveryFee", 0]
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
            totalCount: 0
        };

        const orders = aggregationResult[0].data;

        res.status(200).json({
            success: true,
            data: {
                summary: {
                    totalCommissionEarned: metadata.totalCommissionEarned,
                    totalDeliveryFeesHeld: metadata.totalDeliveryFeesHeld,
                    combinedPlatformRevenue: metadata.totalCommissionEarned + metadata.totalDeliveryFeesHeld
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
 * Body: { riderId }
 */
export const assignRiderToOrder = async (req, res) => {
    // Step 3: Get Socket IO Instance
    const io = req.app.get('io');
    if (!io) {
        console.warn('⚠️ Socket.IO instance not available for rider notification');
    }

    const { vendorOrderId } = req.params;
    const { riderId } = req.body;

    // Step 4: Validation Helper
    const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

    if (!vendorOrderId || !isValidObjectId(vendorOrderId)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid vendor order ID format'
        });
    }

    if (!riderId || !isValidObjectId(riderId)) {
        return res.status(400).json({
            success: false,
            message: 'riderId is required and must be a valid ID'
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

        // Step 3: Validate the order is in the correct state
        const validStatuses = ['ready_for_pickup', 'ready'];
        if (!validStatuses.includes(vendorOrder.orderStatus)) {
            return res.status(400).json({
                success: false,
                message: `Order cannot be assigned a rider at this stage. Current status: ${vendorOrder.orderStatus}. Order must be ready_for_pickup before rider assignment.`
            });
        }

        // Step 4: Find and validate the Rider
        const Rider = (await import("../../../model/rider.model.js")).default;
        const rider = await Rider.findById(riderId);
        if (!rider) {
            return res.status(404).json({
                success: false,
                message: "Rider not found"
            });
        }

        // Check availability (status virtual isAvailable: status === "available" && isActive && !deletedAt)
        if (rider.status !== 'available' || !rider.isActive || rider.deletedAt) {
            return res.status(400).json({
                success: false,
                message: "This rider is currently unavailable or on another delivery"
            });
        }

        // Step 6: Find the Vendor
        const vendor = await Vendor.findById(vendorOrder.restaurantId).select('storeName deliveryManagedBy');

        // Step 7: Perform the database updates atomically using Promise.allSettled
        const updatePromises = [
            // a) Update VendorOrder(s) — use updateMany to capture all vendors in the order
            VendorOrder.updateMany(
                { userOrderId: masterOrder._id },
                { $set: { orderStatus: 'rider_assigned', riderId: riderId } }
            ),
            // b) Update master Order
            Order.updateOne(
                { _id: masterOrder._id },
                { $set: { orderStatus: 'rider_assigned', riderId: riderId } } // Also set riderId on master order as seen in schema
            ),
            // c) Update Rider availability
            Rider.updateOne(
                { _id: riderId },
                { 
                    $set: { 
                        status: 'pending_assignment', 
                        currentOrderId: masterOrder._id // The schema says currentOrderId ref "Order"
                    } 
                }
            )
        ];

        const results = await Promise.allSettled(updatePromises);

        // Check critical updates (a and b)
        if (results[0].status === 'rejected' || results[1].status === 'rejected') {
            const error = results[0].reason || results[1].reason;
            console.error('❌ Critical database update failed:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to assign rider to order',
                error: error.message
            });
        }

        if (results[2].status === 'rejected') {
            console.warn('⚠️ Rider availability update failed:', results[2].reason?.message);
        }

        console.log('✅ Database updates completed successfully');

        // Step 8: Fire socket events (non-fatal)
        const { emitToRestaurant, emitToOrder, emitToAdmin, emitToRider } = await import("../../../socket/socketServer.js");
        const { SOCKET_EVENTS, buildPayload } = await import("../../../socket/rider.events.js");

        try {
            // a) Notify the rider immediately via socket for real-time dashboard update
            emitToRider(riderId, SOCKET_EVENTS.ORDER_ASSIGNED_TO_RIDER, buildPayload.orderAssigned({
                orderId: masterOrder._id,
                riderId: rider._id,
                vendorId: vendor?._id,
                vendorName: vendor?.storeName,
                items: masterOrder.items,
                deliveryAddress: masterOrder.deliveryAddress,
                customerName: masterOrder.deliveryAddress?.name || "Customer",
                customerPhone: masterOrder.deliveryAddress?.phone,
                note: masterOrder.note,
                payout: 600
            }));
            console.log(`✅ Socket: Order assigned event emitted to rider:${riderId}`);
        } catch (e) { console.error('⚠️ Socket error (rider):', e.message); }

        try {
            // ✅ Use unified notification service for real-time + push capability
            const { sendRiderNotification } = await import("../../../services/notification.service.js");
            await sendRiderNotification(rider._id, masterOrder._id, "order_assigned", {
                restaurantName: vendor?.storeName,
                orderDatabaseId: masterOrder._id,
                payout: 600
            });
            console.log(`✅ Socket + Push: Order assigned event emitted/sent to rider:${riderId}`);
        } catch (e) { console.error('⚠️ Notification error (rider):', e.message); }

        try {
            // b) Notify the vendor
            emitToRestaurant(vendorOrder.restaurantId, 'order_status_update', {
                orderId: vendorOrder._id,
                status: 'rider_assigned',
                riderId: riderId,
                riderName: rider.name,
                message: 'A rider has been assigned to your order'
            });
            console.log(`✅ Socket: Order status update emitted to vendor:${vendorOrder.restaurantId}`);
        } catch (e) { console.error('⚠️ Socket error (vendor):', e.message); }

        try {
            // c) Notify the customer
            emitToOrder(masterOrder._id, 'order_status_update', {
                orderId: masterOrder._id,
                status: 'rider_assigned',
                message: `Rider ${rider.name} has been assigned to your order`,
                riderName: rider.name,
                rider: rider.getPublicProfile ? rider.getPublicProfile() : rider
            });
            console.log(`✅ Socket: Order status update emitted to order:${masterOrder._id}`);
        } catch (e) { console.error('⚠️ Socket error (customer):', e.message); }

        try {
            // d) Confirm to admin
            emitToAdmin(null, 'rider_assignment_confirmed', {
                vendorOrderId: vendorOrder._id,
                riderId: riderId,
                riderName: rider.name,
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
                    riderName: rider.name
                }
            );
            console.log('✅ Push: Vendor notification sent');
        } catch (e) { console.error('⚠️ Push error (vendor):', e.message); }

        // Step 10: Return success response
        res.status(200).json({
            success: true,
            message: `Rider ${rider.name} successfully assigned to order`,
            data: {
                vendorOrderId: vendorOrder._id,
                orderId: masterOrder.orderId || masterOrder._id,
                riderId: rider._id,
                riderName: rider.name,
                riderPhone: rider.phone,
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
