import Wallet from "../../../model/wallet/wallet.mode.js";
import Order from "../../../model/order/Order.js";
import VendorOrder from "../../../model/vendor/VendorOrder.js";
import Vendor from "../../../model/vendor/vendor.model.js";
import Refund from "../../../model/refund.model.js";
import { getPlatformConfig } from "../../../services/platformConfig.service.js";
import axios from "axios";
import mongoose from "mongoose";
import {
    createVendorOrdersAndUpdateWallets,
    updateOrderAfterPayment,
} from "../../order/createOrderV2.controller.js";

const buildTransactionDateMatch = (startDate, endDate) => {
    const match = {};
    if (startDate || endDate) {
        match["transactions.date"] = {};
        if (startDate) match["transactions.date"].$gte = new Date(startDate);
        if (endDate) match["transactions.date"].$lte = new Date(endDate);
    }
    return match;
};

const getAdminWalletBalance = async () => {
    const wallet = await Wallet.findOne({ ownerModel: "Admin" }).select("balance").lean();
    return wallet?.balance || 0;
};

const getPaymentRecoveryState = (order, vendorOrderCount = 0) => {
    if (!order) return "missing_order";
    if (order.paymentStatus === "paid" && vendorOrderCount > 0) return "fulfilled";
    if (order.paymentStatus === "paid" && vendorOrderCount === 0) return "fulfillment_missing";
    if (order.paymentStatus === "pending" && order.paymentReference) return "awaiting_verification";
    if (order.paymentStatus === "failed") return "failed";
    if (order.paymentStatus === "refunded") return "refunded";
    return "review";
};

const verifyPaystackReference = async (reference) => {
    if (!reference) return null;
    const verifyResp = await axios.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            },
        }
    );
    return verifyResp.data?.data || null;
};

const fulfillPaidOrderIfMissing = async (order) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const hydratedOrder = await Order.findById(order._id).session(session);
        if (!hydratedOrder) throw new Error("Order not found during fulfillment recovery");

        if (hydratedOrder.paymentStatus !== "paid") {
            hydratedOrder.paymentStatus = "paid";
        }
        if (["pending", "failed", "cancelled"].includes(hydratedOrder.orderStatus)) {
            hydratedOrder.orderStatus = "accepted";
        }
        await hydratedOrder.save({ session });

        const existingCount = await VendorOrder.countDocuments({ userOrderId: hydratedOrder._id }).session(session);
        let createdVendorOrders = false;

        if (existingCount === 0) {
            await createVendorOrdersAndUpdateWallets(hydratedOrder, session);
            createdVendorOrders = true;
        }

        await session.commitTransaction();
        session.endSession();

        const recoveredOrder = await Order.findById(order._id).lean();
        const recoveredCount = await VendorOrder.countDocuments({ userOrderId: order._id });
        return {
            order: recoveredOrder,
            createdVendorOrders,
            vendorOrderCount: recoveredCount,
        };
    } catch (error) {
        if (session.inTransaction()) await session.abortTransaction();
        session.endSession();
        throw error;
    }
};

const getAdminWalletTransactionStats = async ({ startDate, endDate } = {}) => {
    const stats = await Wallet.aggregate([
        { $match: { ownerModel: "Admin" } },
        { $unwind: "$transactions" },
        { $match: buildTransactionDateMatch(startDate, endDate) },
        {
            $group: {
                _id: null,
                totalCredits: {
                    $sum: { $cond: [{ $eq: ["$transactions.type", "credit"] }, "$transactions.amount", 0] }
                },
                totalDebits: {
                    $sum: { $cond: [{ $eq: ["$transactions.type", "debit"] }, "$transactions.amount", 0] }
                },
                totalPlatformDeliveryRevenue: {
                    $sum: {
                        $cond: [
                            { $eq: ["$transactions.transactionType", "delivery_spread"] },
                            { $ifNull: ["$transactions.reportingAmount", 0] },
                            0
                        ]
                    }
                },
                totalServiceFeeRevenue: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $eq: ["$transactions.transactionType", "service_fee"] },
                                    { $eq: ["$transactions.type", "credit"] }
                                ]
                            },
                            "$transactions.amount",
                            0
                        ]
                    }
                }
            }
        }
    ]);

    return stats[0] || {
        totalCredits: 0,
        totalDebits: 0,
        totalPlatformDeliveryRevenue: 0,
        totalServiceFeeRevenue: 0,
    };
};

/**
 * GET REVENUE SUMMARY
 * Route: GET /api/admin/finance/summary
 */
export const getRevenueSummary = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const platformConfig = await getPlatformConfig();

        const dateFilter = {};
        const parentOrderDateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            parentOrderDateFilter["parentOrder.createdAt"] = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
            if (startDate) parentOrderDateFilter["parentOrder.createdAt"].$gte = new Date(startDate);
            if (endDate) parentOrderDateFilter["parentOrder.createdAt"].$lte = new Date(endDate);
        }

        const commissionPromise = VendorOrder.aggregate([
            {
                $lookup: {
                    from: "orders",
                    localField: "userOrderId",
                    foreignField: "_id",
                    as: "parentOrder"
                }
            },
            { $unwind: "$parentOrder" },
            {
                $match: {
                    "parentOrder.paymentStatus": "paid",
                    ...parentOrderDateFilter
                }
            },
            {
                $group: {
                    _id: null,
                    totalCommissionEarned: { $sum: "$commission" }
                }
            }
        ]);

        const orderStatsPromise = Order.aggregate([
            { $match: { paymentStatus: "paid", ...dateFilter } },
            {
                $group: {
                    _id: null,
                    totalOrderRevenue: { $sum: "$total" },
                    totalDeliveryFeesCollected: { $sum: "$deliveryFee" },
                    totalServiceFeesCollected: { $sum: "$serviceFee" }
                }
            }
        ]);

        const activeEscrowPromise = VendorOrder.aggregate([
            {
                $lookup: {
                    from: "orders",
                    localField: "userOrderId",
                    foreignField: "_id",
                    as: "parentOrder"
                }
            },
            { $unwind: "$parentOrder" },
            {
                $match: {
                    "parentOrder.paymentStatus": "paid",
                    "escrowReleased": false,
                    ...parentOrderDateFilter
                }
            },
            {
                $group: {
                    _id: null,
                    totalEscrowHeld: { $sum: "$escrowAmount" }
                }
            }
        ]);

        const [
            commissionStats,
            orderStats,
            activeEscrowStats,
            currentPlatformBalance,
            walletTxnStats,
        ] = await Promise.all([
            commissionPromise,
            orderStatsPromise,
            activeEscrowPromise,
            getAdminWalletBalance(),
            getAdminWalletTransactionStats({ startDate, endDate }),
        ]);

        const commEarned = commissionStats[0]?.totalCommissionEarned || 0;
        const delivRevenue = walletTxnStats.totalPlatformDeliveryRevenue || 0;
        const totalServiceFeeRevenue = walletTxnStats.totalServiceFeeRevenue || 0;
        const totalEscrowHeld = activeEscrowStats[0]?.totalEscrowHeld || 0;
        const availableBalance = Math.max(0, currentPlatformBalance - totalEscrowHeld);
        const totalDeliverySpreadEarned = delivRevenue;
        const deliveryFeeExample = 1000;

        res.status(200).json({
            success: true,
            data: {
                currentPlatformBalance,
                totalEscrowHeld,
                availableBalance,
                totalCommissionEarned: commEarned,
                totalDeliverySpreadEarned,
                totalServiceFeeRevenue,
                combinedPlatformRevenue: commEarned + delivRevenue + totalServiceFeeRevenue,
                totalOrderRevenue: orderStats[0]?.totalOrderRevenue || 0,
                totalDeliveryFeesCollected: orderStats[0]?.totalDeliveryFeesCollected || 0,
                totalServiceFeesCollected: orderStats[0]?.totalServiceFeesCollected || 0,
                totalCredits: walletTxnStats.totalCredits || 0,
                totalDebits: walletTxnStats.totalDebits || 0,
                period: { startDate, endDate },
                revenueModel: {
                    commissionRate: platformConfig.commissionEnabled
                        ? `${platformConfig.commissionRate}% (enabled)`
                        : '0% (disabled)',
                    spreadPerOrder: `?${deliveryFeeExample - platformConfig.riderFixedPayout} (approx - varies by city fee)`,
                    riderPayout: `?${platformConfig.riderFixedPayout} fixed per platform delivery`,
                    serviceFee: platformConfig.serviceFeeEnabled
                        ? `${platformConfig.serviceFeeType === 'fixed' ? '?' + platformConfig.serviceFeeValue : platformConfig.serviceFeeValue + '%'} (max ?${platformConfig.serviceFeeCap})`
                        : 'Disabled',
                }
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET REVENUE CHART DATA
 * Route: GET /api/admin/finance/chart
 */
export const getRevenueChart = async (req, res) => {
    try {
        const { period = "7days" } = req.query;
        const platformConfig = await getPlatformConfig();

        let dateFormat = "%Y-%m-%d";
        let daysToLookBack = 7;
        let groupType = "day";

        if (period === "30days") {
            daysToLookBack = 30;
        } else if (period === "90days" || period === "3months") {
            daysToLookBack = 90;
            dateFormat = "%Y-W%V"; // Weekly
            groupType = "week";
        } else if (period === "12months") {
            daysToLookBack = 365;
            dateFormat = "%Y-%m"; // Monthly
            groupType = "month";
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysToLookBack);

        // Aggregation for chart data
        const chartData = await VendorOrder.aggregate([
            {
                $lookup: {
                    from: "orders",
                    localField: "userOrderId",
                    foreignField: "_id",
                    as: "parentOrder"
                }
            },
            { $unwind: "$parentOrder" },
            {
                $lookup: {
                    from: "vendors",
                    localField: "restaurantId",
                    foreignField: "_id",
                    as: "vendor"
                }
            },
            { $unwind: "$vendor" },
            {
                $match: {
                    "parentOrder.paymentStatus": "paid",
                    createdAt: { $gte: startDate }
                }
            },
            {
                $project: {
                    createdAt: 1,
                    commission: 1,
                    // Dynamic spread based on historical data where available, fallback to config
                    platformDeliveryShare: {
                        $max: [
                            0,
                            {
                                $subtract: [
                                    "$parentOrder.deliveryFee",
                                    { $ifNull: ["$parentOrder.riderEarnings", platformConfig.riderFixedPayout] }
                                ]
                            }
                        ]
                    },
                    serviceFee: { $ifNull: ["$parentOrder.serviceFee", 0] },
                    userOrderId: 1,
                    parentOrderTotal: "$parentOrder.total",
                    label: { $dateToString: { format: dateFormat, date: "$createdAt" } }
                }
            },
            {
                $group: {
                    _id: "$label",
                    commission: { $sum: "$commission" },
                    deliveryRevenue: { $sum: "$platformDeliveryShare" },
                    serviceFeeRevenue: { $sum: "$serviceFee" },
                    globalGMV: { $sum: "$parentOrderTotal" },
                    orderCount: { $addToSet: "$userOrderId" }
                }
            },
            {
                $project: {
                    label: "$_id",
                    commission: 1,
                    deliveryRevenue: 1,
                    serviceFeeRevenue: 1,
                    globalGMV: 1,
                    totalRevenue: { $add: ["$commission", "$deliveryRevenue", "$serviceFeeRevenue"] },
                    orderCount: { $size: "$orderCount" }
                }
            },
            { $sort: { label: 1 } }
        ]);

        // Fill missing buckets (simplified implementation)
        // In a production environment, we'd generate all dates/weeks/months in range first
        res.status(200).json({
            success: true,
            data: {
                period,
                chart: chartData
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET TRANSACTION LEDGER
 * Route: GET /api/admin/finance/transactions
 */
export const getTransactionLedger = async (req, res) => {
    try {
        const {
            type,
            transactionType,
            startDate,
            endDate,
            search,
            page = 1,
            limit = 25
        } = req.query;

        const wallet = await Wallet.findOne({ ownerModel: "Admin" }).lean();
        if (!wallet) {
            return res.status(200).json({
                success: true,
                data: { transactions: [], pagination: { total: 0, page, limit, totalPages: 0 } }
            });
        }

        // Exclude zero-amount entries — these are informational delivery_spread records
        // used for reporting only. Including them creates confusing ₦0 debit rows in the ledger.
        let allTransactions = wallet.transactions.filter(tx => tx.amount > 0);

        // 1. Compute Full History for Running Balance
        allTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));

        let running = 0;
        allTransactions = allTransactions.map(tx => {
            if (tx.type === "credit") running += tx.amount;
            else running -= tx.amount;
            return { ...tx, runningBalance: Number(running.toFixed(2)) };
        });

        // 2. Filter based on query
        let filtered = allTransactions;

        if (type && type !== "all") {
            filtered = filtered.filter(tx => tx.type === type);
        }
        if (transactionType && transactionType !== "all") {
            filtered = filtered.filter(tx => tx.transactionType === transactionType);
        }
        if (startDate) {
            filtered = filtered.filter(tx => new Date(tx.date) >= new Date(startDate));
        }
        if (endDate) {
            filtered = filtered.filter(tx => new Date(tx.date) <= new Date(endDate));
        }
        let searchOrderIds = [];
        if (search) {
            const matchingOrders = await Order.find({
                orderId: { $regex: search, $options: "i" },
            }).select("_id").lean();
            searchOrderIds = matchingOrders.map((order) => order._id.toString());

            const s = search.toLowerCase();
            filtered = filtered.filter(tx =>
                tx.description?.toLowerCase().includes(s) ||
                (tx.orderId && searchOrderIds.includes(tx.orderId.toString()))
            );
        }

        // Sort descending for response
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        // 3. Paginate
        const total = filtered.length;
        const startIndex = (parseInt(page) - 1) * parseInt(limit);
        const paginatedSlice = filtered.slice(startIndex, startIndex + parseInt(limit));

        // 4. Batch Populate Orders
        const validOrderIds = paginatedSlice
            .filter(tx => tx.orderId && mongoose.Types.ObjectId.isValid(tx.orderId))
            .map(tx => tx.orderId);

        const orders = await Order.find({ _id: { $in: validOrderIds } })
            .select("orderId orderStatus total")
            .lean();

        const orderMap = orders.reduce((acc, order) => {
            acc[order._id.toString()] = order;
            return acc;
        }, {});

        const responseTx = paginatedSlice.map(tx => ({
            ...tx,
            order: tx.orderId ? orderMap[tx.orderId.toString()] || null : null
        }));

        res.status(200).json({
            success: true,
            data: {
                transactions: responseTx,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / limit)
                },
                walletSummary: {
                    currentBalance: wallet.balance,
                    totalCredited: allTransactions.filter(t => t.type === "credit").reduce((s, t) => s + t.amount, 0),
                    totalDebited: allTransactions.filter(t => t.type === "debit").reduce((s, t) => s + t.amount, 0),
                }
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET REVENUE BREAKDOWN BY VENDOR
 * Route: GET /api/admin/finance/vendor-breakdown
 */
export const getVendorBreakdown = async (req, res) => {
    try {
        const { startDate, endDate, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const platformConfig = await getPlatformConfig();

        const dateFilter = {};
        const parentOrderDateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            parentOrderDateFilter["parentOrder.createdAt"] = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
            if (startDate) parentOrderDateFilter["parentOrder.createdAt"].$gte = new Date(startDate);
            if (endDate) parentOrderDateFilter["parentOrder.createdAt"].$lte = new Date(endDate);
        }

        const aggregation = await VendorOrder.aggregate([
            {
                $lookup: {
                    from: "orders",
                    localField: "userOrderId",
                    foreignField: "_id",
                    as: "parentOrder"
                }
            },
            { $unwind: "$parentOrder" },
            {
                $match: {
                    "parentOrder.paymentStatus": "paid",
                    ...parentOrderDateFilter
                }
            },
            {
                $group: {
                    _id: "$restaurantId",
                    orderCount: { $sum: 1 },
                    commissionPaid: { $sum: "$commission" },
                    vendorEarnings: { $sum: "$vendorTotal" },
                    deliveryShareGenerated: {
                        $sum: {
                            $max: [
                                0,
                                {
                                    $subtract: [
                                        "$parentOrder.deliveryFee",
                                        { $ifNull: ["$parentOrder.riderEarnings", platformConfig.riderFixedPayout] }
                                    ]
                                }
                            ]
                        }
                    },
                    totalSubtotal: { $sum: { $add: ["$commission", "$vendorTotal"] } }
                }
            },
            {
                $lookup: {
                    from: "vendors",
                    localField: "_id",
                    foreignField: "_id",
                    as: "vendorInfo"
                }
            },
            { $unwind: "$vendorInfo" },
            {
                $project: {
                    vendorId: "$_id",
                    storeName: "$vendorInfo.storeName",
                    orderCount: 1,
                    totalSubtotal: 1,
                    commissionPaid: 1,
                    vendorEarnings: 1,
                    deliveryShareGenerated: 1
                }
            },
            { $sort: { orderCount: -1 } }, // commission is 0 for all vendors currently — sort by volume instead
            {
                $facet: {
                    vendors: [{ $skip: skip }, { $limit: parseInt(limit) }],
                    count: [{ $count: "total" }],
                    overall: [
                        {
                            $group: {
                                _id: null,
                                totalCommission: { $sum: "$commissionPaid" },
                                totalVendorEarnings: { $sum: "$vendorEarnings" },
                                totalDeliveryShare: { $sum: "$deliveryShareGenerated" }
                            }
                        }
                    ]
                }
            }
        ]);

        const total = aggregation[0].count[0]?.total || 0;
        const overall = aggregation[0].overall[0] || {
            totalCommission: 0,
            totalVendorEarnings: 0,
            totalDeliveryShare: 0
        };

        res.status(200).json({
            success: true,
            data: {
                vendors: aggregation[0].vendors,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / limit)
                },
                totals: overall
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET UNRELEASED ESCROW LIST
 * Route: GET /api/admin/finance/escrow
 */
export const getUnreleasedEscrowList = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, startDate, endDate } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const matchStage = {
            "parentOrder.paymentStatus": "paid",
            escrowReleased: false
        };

        if (startDate || endDate) {
            matchStage["parentOrder.createdAt"] = {};
            if (startDate) matchStage["parentOrder.createdAt"].$gte = new Date(startDate);
            if (endDate) matchStage["parentOrder.createdAt"].$lte = new Date(endDate);
        }

        if (search) {
            matchStage["parentOrder.orderId"] = { $regex: search, $options: "i" };
        }

        const aggregation = await VendorOrder.aggregate([
            {
                $lookup: {
                    from: "orders",
                    localField: "userOrderId",
                    foreignField: "_id",
                    as: "parentOrder"
                }
            },
            { $unwind: "$parentOrder" },
            {
                $lookup: {
                    from: "vendors",
                    localField: "restaurantId",
                    foreignField: "_id",
                    as: "vendorInfo"
                }
            },
            { $unwind: "$vendorInfo" },
            { $match: matchStage },
            { $sort: { createdAt: -1 } },
            {
                $facet: {
                    data: [
                        { $skip: skip },
                        { $limit: parseInt(limit) },
                        {
                            $project: {
                                _id: 1,
                                escrowAmount: 1,
                                orderStatus: 1,
                                createdAt: 1,
                                "parentOrder.orderId": 1,
                                "parentOrder.total": 1,
                                "parentOrder.paymentStatus": 1,
                                "vendorInfo._id": 1,
                                "vendorInfo.storeName": 1,
                            }
                        }
                    ],
                    count: [{ $count: "total" }],
                    stats: [
                        { $group: { _id: null, sum: { $sum: "$escrowAmount" } } }
                    ]
                }
            }
        ]);

        const data = aggregation[0].data;
        const total = aggregation[0].count[0]?.total || 0;
        const sum = aggregation[0].stats[0]?.sum || 0;

        res.status(200).json({
            success: true,
            data: {
                escrowOrders: data,
                totalEscrowHeld: sum,
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
 * GET REFUNDS LIST
 * Route: GET /api/admin/finance/refunds
 */
export const getRefundsList = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, startDate, endDate } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        let query = {};
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        if (search) {
            const matchingOrders = await Order.find({
                orderId: { $regex: search, $options: "i" }
            }).select("_id").lean();

            if (matchingOrders.length > 0) {
                query.orderId = { $in: matchingOrders.map(o => o._id) };
            } else {
                query.reason = { $regex: search, $options: "i" };
            }
        }

        const total = await Refund.countDocuments(query);
        const refunds = await Refund.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('orderId', 'orderId total paymentStatus')
            .populate('userId', 'email firstname lastname')
            .lean();

        res.status(200).json({
            success: true,
            data: {
                refunds,
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
 * GET PAYMENT RECOVERY LIST
 * Route: GET /api/admin/finance/payment-recovery
 */
export const getPaymentRecoveryList = async (req, res) => {
    try {
        const {
            search,
            status = "all",
            page = 1,
            limit = 25,
            startDate,
            endDate,
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const query = {};

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        if (search) {
            const regex = { $regex: search, $options: "i" };
            query.$or = [
                { orderId: regex },
                { paymentReference: regex },
                { phone: regex },
                { "deliveryAddress.name": regex },
                { "deliveryAddress.phone": regex },
            ];
        }

        if (["pending", "paid", "failed", "refunded"].includes(status)) {
            query.paymentStatus = status;
        }

        const total = await Order.countDocuments(query);
        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate("userId", "firstname lastname email phone")
            .lean();

        const vendorOrderCounts = await VendorOrder.aggregate([
            { $match: { userOrderId: { $in: orders.map((order) => order._id) } } },
            { $group: { _id: "$userOrderId", count: { $sum: 1 } } },
        ]);
        const countMap = vendorOrderCounts.reduce((acc, entry) => {
            acc[String(entry._id)] = entry.count;
            return acc;
        }, {});

        let payments = orders.map((order) => {
            const vendorOrderCount = countMap[String(order._id)] || 0;
            return {
                ...order,
                vendorOrderCount,
                recoveryState: getPaymentRecoveryState(order, vendorOrderCount),
            };
        });

        if (["awaiting_verification", "fulfillment_missing", "fulfilled", "review"].includes(status)) {
            payments = payments.filter((order) => order.recoveryState === status);
        }

        const summaryMatch = startDate || endDate ? { createdAt: query.createdAt } : {};
        const [paymentStats, vendorOrderStats] = await Promise.all([
            Order.aggregate([
                { $match: summaryMatch },
                {
                    $group: {
                        _id: "$paymentStatus",
                        count: { $sum: 1 },
                        amount: { $sum: "$total" },
                    },
                },
            ]),
            VendorOrder.aggregate([
                {
                    $group: {
                        _id: "$userOrderId",
                        count: { $sum: 1 },
                    },
                },
            ]),
        ]);

        const vendorOrderParentIds = new Set(vendorOrderStats.map((entry) => String(entry._id)).filter(Boolean));
        const paidMissingFulfillment = await Order.countDocuments({
            paymentStatus: "paid",
            _id: { $nin: [...vendorOrderParentIds].filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id)) },
            ...summaryMatch,
        });

        return res.status(200).json({
            success: true,
            data: {
                payments,
                summary: {
                    byPaymentStatus: paymentStats.reduce((acc, entry) => {
                        acc[entry._id || "unknown"] = {
                            count: entry.count,
                            amount: entry.amount,
                        };
                        return acc;
                    }, {}),
                    paidMissingFulfillment,
                },
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / limit),
                },
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * POST PAYMENT RECONCILIATION
 * Route: POST /api/admin/finance/payment-recovery/:reference/reconcile
 */
export const reconcilePaymentReference = async (req, res) => {
    try {
        const { reference } = req.params;
        if (!reference) {
            return res.status(400).json({ success: false, message: "Payment reference is required" });
        }

        const order = await Order.findOne({
            $or: [{ paymentReference: reference }, { orderId: reference }],
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "No local order found for this payment reference. Check Paystack dashboard and refund or escalate manually.",
                recoveryState: "missing_order",
            });
        }

        let paystack = null;
        if (order.paymentReference) {
            paystack = await verifyPaystackReference(order.paymentReference);
        }

        if (paystack && paystack.status !== "success") {
            order.paymentStatus = "failed";
            order.orderStatus = "failed";
            await order.save();
            return res.status(200).json({
                success: true,
                message: "Payment was not successful on Paystack. Order marked failed.",
                order,
                paystack: {
                    status: paystack.status,
                    reference: paystack.reference,
                    gateway_response: paystack.gateway_response,
                },
                recoveryState: "failed",
            });
        }

        let recovered = { order, createdVendorOrders: false, vendorOrderCount: await VendorOrder.countDocuments({ userOrderId: order._id }) };

        if (paystack?.status === "success" && order.paymentStatus !== "paid") {
            if (order.paymentStatus === "pending") {
                const updatedOrder = await updateOrderAfterPayment(order._id, order.paymentReference);
                recovered = {
                    order: updatedOrder,
                    createdVendorOrders: true,
                    vendorOrderCount: await VendorOrder.countDocuments({ userOrderId: order._id }),
                };
            } else {
                recovered = await fulfillPaidOrderIfMissing(order);
            }
        } else if (order.paymentStatus === "paid" && recovered.vendorOrderCount === 0) {
            recovered = await fulfillPaidOrderIfMissing(order);
        }

        const recoveryState = getPaymentRecoveryState(recovered.order, recovered.vendorOrderCount);

        return res.status(200).json({
            success: true,
            message: recovered.createdVendorOrders
                ? "Payment reconciled and vendor order fulfillment recovered."
                : "Payment reconciliation completed. No fulfillment repair was needed.",
            order: recovered.order,
            paystack: paystack
                ? {
                    status: paystack.status,
                    reference: paystack.reference,
                    paid_at: paystack.paid_at,
                    amount: paystack.amount ? paystack.amount / 100 : null,
                }
                : null,
            vendorOrderCount: recovered.vendorOrderCount,
            recoveryState,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
