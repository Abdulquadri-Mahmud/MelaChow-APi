import Order from "../../../model/order/Order.js";
import VendorOrder from "../../../model/vendor/VendorOrder.js";
import Vendor from "../../../model/vendor/vendor.model.js";
import Wallet from "../../../model/wallet/wallet.mode.js";
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

        const orders = await Order.find(filters)
            .populate("userId", "firstname lastname email phone")
            .populate("riderId", "firstname lastname phone")
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

        const order = await Order.findOne({ orderId })
            .populate("userId", "firstname lastname email phone")
            .populate("riderId", "firstname lastname phone email profileImage vehicleType")
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

        // Update all VendorOrders
        await VendorOrder.updateMany(
            { userOrderId: order._id },
            { $set: { orderStatus: status } }
        );

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
        const { status, paymentStatus, startDate, endDate, page = 1, limit = 20 } = req.query;
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

        const orders = await Order.find(filter)
            .populate("userId", "firstname lastname email phone")
            .populate("riderId", "firstname lastname phone profileImage vehicleType")
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
