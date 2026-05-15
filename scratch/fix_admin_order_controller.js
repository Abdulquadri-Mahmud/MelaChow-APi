import fs from 'fs';
import path from 'path';

const filePath = 'c:\\Users\\USER\\Documents\\AdeyemiCode\\MelaChow-Codebase\\MelaChowApi\\controller\\Admin\\order_management\\adminOrder.controller.js';

const content = `import Order from "../../../model/order/Order.js";
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

        if (status) filters.orderStatus = status;
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
            changedBy: \`admin:\${req.admin._id}\`,
            timestamp: new Date()
        });

        await order.save();

        await VendorOrder.updateMany(
            { userOrderId: order._id },
            { $set: { orderStatus: status } }
        );

        if (status === 'cancelled' && order.paymentStatus === 'paid') {
            try {
                const { refundOrderToWallet } = await import("../../../services/refund.service.js");
                await refundOrderToWallet(order._id, 'admin_cancel');
                console.log(\`✅ Admin cancel refund processed for Order \${order.orderId}\`);
            } catch (refundErr) {
                console.error(\`❌ Refund failed after admin cancel for Order \${order.orderId}:\`, refundErr.message);
            }
        }

        try {
            const { sendOrderNotification, sendVendorNotification } = await import("../../../services/notification.service.js");
            await sendOrderNotification(order.userId, order.orderId, status, {
                orderDatabaseId: order._id,
                cancellationReason: status === 'cancelled' ? reason : undefined
            });
            const vendorOrders = await VendorOrder.find({ userOrderId: order._id });
            for (const vo of vendorOrders) {
                await sendVendorNotification(vo.restaurantId, order._id, "system", {
                    orderId: order.orderId,
                    title: \`Status Updated by Admin\`,
                    message: \`The status of Order #\${order.orderId} has been updated to "\${status}" by platform administration.\`
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
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const filter = {};
        if (status) {
            filter.orderStatus = status;
        } else if (statusGroup === "logistics") {
            filter.orderStatus = {
                $in: ["ready_for_pickup", "rider_assigned", "out_for_delivery", "delivered"]
            };
        }
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
 */
export const assignRiderToOrder = async (req, res) => {
    const io = req.app.get('io');
    const { vendorOrderId } = req.params;
    const riderIds = Array.isArray(req.body.riderIds)
        ? req.body.riderIds
        : (req.body.riderId ? [req.body.riderId] : []);
    const uniqueRiderIds = [...new Set(riderIds.map((id) => id?.toString()).filter(Boolean))];
    const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
    if (!vendorOrderId || !isValidObjectId(vendorOrderId)) {
        return res.status(400).json({ success: false, message: 'Invalid vendor order ID format' });
    }
    if (!uniqueRiderIds.length || uniqueRiderIds.some((id) => !isValidObjectId(id))) {
        return res.status(400).json({ success: false, message: 'riderId or riderIds is required' });
    }
    try {
        let vendorOrder = await VendorOrder.findById(vendorOrderId).populate("userOrderId");
        if (!vendorOrder) {
            vendorOrder = await VendorOrder.findOne({ userOrderId: vendorOrderId }).populate("userOrderId");
        }
        if (!vendorOrder) {
            return res.status(404).json({ success: false, message: "No order found" });
        }
        const masterOrder = vendorOrder.userOrderId;
        const platformConfig = await getPlatformConfig();
        if (platformConfig.riderAssignmentMode === "automatic") {
            return res.status(409).json({ success: false, message: "Automatic assignment enabled" });
        }
        const riders = await Rider.find({ _id: { $in: uniqueRiderIds } });
        const assignmentExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            await VendorOrder.updateMany({ userOrderId: masterOrder._id }, { $set: { orderStatus: 'rider_assigned' } }, { session });
            await Order.updateOne({ _id: masterOrder._id }, {
                $set: {
                    orderStatus: 'rider_assigned',
                    riderAssignment: {
                        status: 'assigned',
                        assignedAt: new Date(),
                        expiresAt: assignmentExpiresAt,
                        assignedBy: req.admin?._id || null
                    }
                },
                $push: {
                    statusLog: {
                        status: 'rider_assigned',
                        changedBy: \`admin:\${req.admin?._id || 'unknown'}\`,
                        timestamp: new Date()
                    }
                }
            }, { session });
            await Rider.updateMany({ _id: { $in: uniqueRiderIds } }, {
                $set: {
                    status: 'pending_assignment',
                    currentOrderId: masterOrder._id,
                    assignmentExpiresAt
                }
            }, { session });
            await RiderAssignment.create(uniqueRiderIds.map((targetRiderId) => ({
                orderId: masterOrder._id,
                vendorOrderId: vendorOrder._id,
                riderId: targetRiderId,
                vendorId: vendorOrder.restaurantId,
                status: 'assigned',
                assignedBy: req.admin?._id || null,
                expiresAt: assignmentExpiresAt
            })), { session });
            await session.commitTransaction();
            session.endSession();
            res.status(200).json({ success: true, message: 'Riders assigned' });
        } catch (txErr) {
            await session.abortTransaction();
            session.endSession();
            throw txErr;
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
\`;

fs.writeFileSync(filePath, content);
console.log('✅ File fixed successfully');
