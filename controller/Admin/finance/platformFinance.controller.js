import Wallet from "../../../model/wallet/wallet.mode.js";
import Order from "../../../model/order/Order.js";
import VendorOrder from "../../../model/vendor/VendorOrder.js";
import Vendor from "../../../model/vendor/vendor.model.js";
import Refund from "../../../model/refund.model.js";
import Withdrawal from "../../../model/wallet/Withdrawal.model.js";
import RiderWithdrawal from "../../../model/wallet/RiderWithdrawal.model.js";
import { calculatePaystackTransferFee } from "../../../utils/paystackFees.js";
import { getPlatformConfig } from "../../../services/platformConfig.service.js";
import mongoose from "mongoose";
import PaymentAttempt from "../../../model/order/PaymentAttempt.js";
import {
    createVendorOrdersAndUpdateWallets,
    updateOrderAfterPayment,
} from "../../order/createOrderV2.controller.js";
import {
    recordPaymentAttemptEvent,
    validateSuccessfulPaymentForOrder,
    verifyPaystackReference as verifyPaystackReferenceStrict,
} from "../../../services/paymentHardening.service.js";
import { usePostgresAdminFinanceReads } from "../../../services/postgres/compat.js";
import { adminFinanceRepository } from "../../../services/postgres/adminFinance.repository.js";

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

// Shared helper: back-computes the Paystack transfer fee the platform silently
// absorbed on completed rider withdrawals in a window (RiderWithdrawal.transferFee
// is always stored as 0 by design — the real cost never touches our own records
// anywhere else, so this is an ESTIMATE using the same fee schedule Paystack
// actually charges us, mirrored in utils/paystackFees.js).
const getEstimatedRiderTransferFeeCost = async (dayStart, dayEnd) => {
    const match = { status: "completed" };
    if (dayStart && dayEnd) match.settledAt = { $gte: dayStart, $lt: dayEnd };

    const withdrawals = await RiderWithdrawal.find(match, { requestedAmount: 1 }).lean();
    const estimatedFeeTotal = withdrawals.reduce(
        (sum, w) => sum + calculatePaystackTransferFee(w.requestedAmount || 0), 0
    );
    return { estimatedFeeTotal, withdrawalCount: withdrawals.length };
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
    return verifyPaystackReferenceStrict(reference);
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
            await recordPaymentAttemptEvent({
                reference: hydratedOrder.paymentReference,
                order: hydratedOrder,
                status: "recovered",
                recoveryState: "fulfilled",
                type: "admin_fulfillment_recovered",
                message: "Admin recovery created missing vendor fulfillment",
                session,
            });
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

        if (usePostgresAdminFinanceReads()) {
            const response = await adminFinanceRepository.getRevenueSummary({ startDate, endDate });
            return res.status(200).json(response);
        }

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

        // Rider transfer fees are absorbed by the platform and never recorded anywhere
        // else — this is the only place that real cost becomes visible in reporting.
        const riderFeeStats = await getEstimatedRiderTransferFeeCost(
            startDate ? new Date(startDate) : null,
            endDate ? new Date(endDate) : null
        );
        const estimatedRiderTransferFeesAbsorbed = riderFeeStats.estimatedFeeTotal;

        res.status(200).json({
            success: true,
            data: {
                currentPlatformBalance,
                totalEscrowHeld,
                availableBalance,
                totalCommissionEarned: commEarned,
                totalDeliverySpreadEarned,
                totalServiceFeeRevenue,
                estimatedRiderTransferFeesAbsorbed,
                combinedPlatformRevenue: commEarned + delivRevenue + totalServiceFeeRevenue,
                combinedPlatformRevenueNetOfRiderFees:
                    commEarned + delivRevenue + totalServiceFeeRevenue - estimatedRiderTransferFeesAbsorbed,
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

        if (usePostgresAdminFinanceReads()) {
            const response = await adminFinanceRepository.getRevenueChart({ period });
            return res.status(200).json(response);
        }

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

        if (usePostgresAdminFinanceReads()) {
            const response = await adminFinanceRepository.getTransactionLedger({ type, transactionType, startDate, endDate, search, page, limit });
            return res.status(200).json(response);
        }

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

        if (usePostgresAdminFinanceReads()) {
            const response = await adminFinanceRepository.getVendorBreakdown({ startDate, endDate, page, limit });
            return res.status(200).json(response);
        }

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

        if (usePostgresAdminFinanceReads()) {
            const response = await adminFinanceRepository.getUnreleasedEscrowList({ page, limit, search, startDate, endDate });
            return res.status(200).json(response);
        }

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

        if (usePostgresAdminFinanceReads()) {
            const response = await adminFinanceRepository.getRefundsList({ page, limit, search, startDate, endDate });
            return res.status(200).json(response);
        }

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

        if (usePostgresAdminFinanceReads()) {
            const response = await adminFinanceRepository.getPaymentRecoveryList({ search, status, page, limit, startDate, endDate });
            return res.status(200).json(response);
        }

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

        const orderIds = orders.map((order) => order._id);
        const references = orders.map((order) => order.paymentReference).filter(Boolean);
        const attempts = await PaymentAttempt.find({
            $or: [
                { orderId: { $in: orderIds } },
                { reference: { $in: references } },
            ],
        }).lean();
        const attemptByOrderId = attempts.reduce((acc, attempt) => {
            if (attempt.orderId) acc[String(attempt.orderId)] = attempt;
            if (attempt.reference) acc[attempt.reference] = attempt;
            return acc;
        }, {});

        let payments = orders.map((order) => {
            const vendorOrderCount = countMap[String(order._id)] || 0;
            const paymentAttempt = attemptByOrderId[String(order._id)] || attemptByOrderId[order.paymentReference] || null;
            return {
                ...order,
                vendorOrderCount,
                paymentAttempt,
                recoveryState: paymentAttempt?.recoveryState === "review"
                    ? "review"
                    : getPaymentRecoveryState(order, vendorOrderCount),
            };
        });

        if (search) {
            const regex = new RegExp(search, "i");
            const orphanAttempts = await PaymentAttempt.find({
                orderId: null,
                $or: [
                    { reference: regex },
                    { orderCode: regex },
                    { "orderSnapshot.orderId": regex },
                ],
            })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean();

            payments = [
                ...payments,
                ...orphanAttempts.map((attempt) => ({
                    _id: attempt._id,
                    orderId: attempt.orderCode || attempt.orderSnapshot?.orderId || "Missing local order",
                    paymentReference: attempt.reference,
                    paymentStatus: attempt.status,
                    orderStatus: "missing_order",
                    total: attempt.expectedAmount || attempt.paidAmount || 0,
                    createdAt: attempt.createdAt,
                    userId: null,
                    phone: "",
                    vendorOrderCount: 0,
                    paymentAttempt: attempt,
                    recoveryState: "missing_order",
                })),
            ];
        }

        if (["awaiting_verification", "fulfillment_missing", "fulfilled", "review", "missing_order"].includes(status)) {
            payments = payments.filter((order) => order.recoveryState === status);
        }

        const summaryMatch = startDate || endDate ? { createdAt: query.createdAt } : {};
        const [paymentStats, vendorOrderStats, attemptStats] = await Promise.all([
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
            PaymentAttempt.aggregate([
                {
                    $group: {
                        _id: "$status",
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
                    byAttemptStatus: attemptStats.reduce((acc, entry) => {
                        acc[entry._id || "unknown"] = entry.count;
                        return acc;
                    }, {}),
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
            let paystack = null;
            try {
                paystack = await verifyPaystackReference(reference);
                await recordPaymentAttemptEvent({
                    reference,
                    payData: paystack,
                    status: paystack?.status === "success" ? "review" : "failed",
                    recoveryState: "missing_order",
                    type: "admin_reconcile_missing_order",
                    message: "Admin reconciled provider reference with no matching local order",
                });
            } catch (verifyError) {
                await recordPaymentAttemptEvent({
                    reference,
                    status: "review",
                    recoveryState: "missing_order",
                    type: "admin_reconcile_missing_order_verify_failed",
                    message: verifyError.message,
                });
            }

            return res.status(404).json({
                success: false,
                message: paystack?.status === "success"
                    ? "Paystack confirms payment, but no local order exists. Escalate for manual order reconstruction or refund."
                    : "No local order found for this payment reference. Check Paystack dashboard and refund or escalate manually.",
                paystack: paystack
                    ? {
                        status: paystack.status,
                        reference: paystack.reference,
                        amount: paystack.amount ? paystack.amount / 100 : null,
                    }
                    : null,
                recoveryState: "missing_order",
            });
        }

        let paystack = null;
        if (order.paymentReference) {
            paystack = await verifyPaystackReference(order.paymentReference);
        }

        if (paystack && paystack.status !== "success") {
            await recordPaymentAttemptEvent({
                reference: order.paymentReference,
                order,
                payData: paystack,
                status: "failed",
                recoveryState: "failed",
                type: "admin_reconcile_provider_failed",
                message: paystack.gateway_response || "Provider payment was not successful",
            });
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
            try {
                await validateSuccessfulPaymentForOrder(order, paystack);
            } catch (validationErr) {
                return res.status(validationErr.statusCode || 409).json({
                    success: false,
                    message: validationErr.message,
                    code: validationErr.code || "PAYMENT_VALIDATION_FAILED",
                    order,
                    paystack: {
                        status: paystack.status,
                        reference: paystack.reference,
                        paid_at: paystack.paid_at,
                        amount: paystack.amount ? paystack.amount / 100 : null,
                    },
                    recoveryState: "review",
                });
            }

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

/**
 * GET /api/admin/finance/daily-snapshot
 * Returns today vs yesterday: money in, escrow released, money out (actual Paystack
 * disbursements using netAmount for vendors), and platform kept (net delivery margin + service fee + commission,
 * minus rider-absorbed Paystack transfer fees).
 */
export const getDailyFinancialSnapshot = async (req, res) => {
    try {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(startOfToday);
        endOfToday.setDate(endOfToday.getDate() + 1);
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);

        const buildDayStats = async (dayStart, dayEnd) => {
            const [
                moneyIn,
                escrowReleasedToday,
                walletCredits,
                deliverySpreadStats,
                vendorWithdrawals,
                riderFeeStats,
                riderWithdrawalsCompletedTotal,
            ] = await Promise.all([
                // Money In: paid orders created in this window (already includes gross
                // delivery fee as part of order.total — do not add delivery_fee again below)
                Order.aggregate([
                    { $match: { paymentStatus: "paid", createdAt: { $gte: dayStart, $lt: dayEnd } } },
                    { $group: { _id: null, total: { $sum: "$total" }, count: { $sum: 1 } } },
                ]),

                // Escrow Released: vendor orders where escrowReleased=true and updatedAt
                // falls in window (approximation — no escrowReleasedAt field exists).
                VendorOrder.aggregate([
                    { $match: { escrowReleased: true, updatedAt: { $gte: dayStart, $lt: dayEnd } } },
                    { $group: { _id: null, total: { $sum: "$escrowAmount" }, count: { $sum: 1 } } },
                ]),

                // Commission + service fee + GROSS delivery fee (informational only —
                // gross delivery fee includes the rider's share, never sum this into
                // platformKept; see deliverySpreadStats below for the actual net figure).
                // These are recorded at ORDER-PAID time.
                Wallet.aggregate([
                    { $match: { ownerModel: "Admin" } },
                    { $unwind: "$transactions" },
                    { $match: { "transactions.date": { $gte: dayStart, $lt: dayEnd }, "transactions.type": "credit" } },
                    {
                        $group: {
                            _id: null,
                            grossDeliveryFeesCollected: {
                                $sum: { $cond: [{ $eq: ["$transactions.transactionType", "delivery_fee"] }, "$transactions.amount", 0] },
                            },
                            serviceFees: {
                                $sum: { $cond: [{ $eq: ["$transactions.transactionType", "service_fee"] }, "$transactions.amount", 0] },
                            },
                            commission: {
                                $sum: { $cond: [{ $eq: ["$transactions.transactionType", "commission"] }, "$transactions.amount", 0] },
                            },
                        },
                    },
                ]),

                // NET delivery margin the platform actually keeps (gross delivery fee
                // minus rider payout). Written as a zero-amount informational entry with
                // the real value in reportingAmount, at DELIVERY-COMPLETION time — a
                // different clock than commission/service fee above. A delivery
                // completed today may belong to an order paid yesterday, and vice versa.
                Wallet.aggregate([
                    { $match: { ownerModel: "Admin" } },
                    { $unwind: "$transactions" },
                    {
                        $match: {
                            "transactions.date": { $gte: dayStart, $lt: dayEnd },
                            "transactions.transactionType": "delivery_spread",
                        },
                    },
                    { $group: { _id: null, total: { $sum: { $ifNull: ["$transactions.reportingAmount", 0] } }, count: { $sum: 1 } } },
                ]),

                // Money Out (vendor): use netAmount — what Paystack actually transferred,
                // not requestedAmount which includes the vendor's own fee deduction.
                Withdrawal.aggregate([
                    { $match: { status: "completed", settledAt: { $gte: dayStart, $lt: dayEnd } } },
                    { $group: { _id: null, total: { $sum: "$netAmount" }, fee: { $sum: "$transferFee" }, count: { $sum: 1 } } },
                ]),

                // Estimated rider transfer fee cost absorbed on withdrawals settled today
                getEstimatedRiderTransferFeeCost(dayStart, dayEnd),

                // Money Out (rider): netAmount === requestedAmount for riders (platform
                // absorbs the fee separately, tracked above), so requestedAmount is correct here.
                RiderWithdrawal.aggregate([
                    { $match: { status: "completed", settledAt: { $gte: dayStart, $lt: dayEnd } } },
                    { $group: { _id: null, total: { $sum: "$requestedAmount" }, count: { $sum: 1 } } },
                ]),
            ]);

            const grossDeliveryFeesCollected = walletCredits[0]?.grossDeliveryFeesCollected || 0;
            const serviceFees = walletCredits[0]?.serviceFees || 0;
            const comm = walletCredits[0]?.commission || 0;
            const netDeliveryMargin = deliverySpreadStats[0]?.total || 0;
            const vendorPayoutsTotal = vendorWithdrawals[0]?.total || 0;
            const vendorTransferFees = vendorWithdrawals[0]?.fee || 0;
            const riderPayoutsTotal = riderWithdrawalsCompletedTotal[0]?.total || 0;
            const riderPayoutCount = riderWithdrawalsCompletedTotal[0]?.count || 0;
            const riderTransferFeeCost = riderFeeStats.estimatedFeeTotal;

            // platformKept = actual net revenue sources minus rider transfer fees absorbed.
            // Uses netDeliveryMargin (delivery_spread), NOT grossDeliveryFeesCollected.
            const platformKept = netDeliveryMargin + serviceFees + comm - riderTransferFeeCost;

            return {
                moneyIn: moneyIn[0]?.total || 0,
                moneyInOrderCount: moneyIn[0]?.count || 0,
                escrowReleased: escrowReleasedToday[0]?.total || 0,
                escrowReleasedCount: escrowReleasedToday[0]?.count || 0,
                grossDeliveryFeesCollected, // informational only — includes rider's share
                netDeliveryMargin,          // what platform actually keeps from delivery
                serviceFees,
                commission: comm,
                vendorPayoutsTotal,
                vendorPayoutTransferFees: vendorTransferFees,
                vendorPayoutCount: vendorWithdrawals[0]?.count || 0,
                riderPayoutsTotal,
                riderPayoutTransferFeesAbsorbed: riderTransferFeeCost,
                riderPayoutCount,
                totalMoneyOut: vendorPayoutsTotal + riderPayoutsTotal,
                platformKept,
            };
        };

        const [today, yesterday, currentEscrowHeld] = await Promise.all([
            buildDayStats(startOfToday, endOfToday),
            buildDayStats(startOfYesterday, startOfToday),
            VendorOrder.aggregate([
                { $match: { escrowReleased: false } },
                { $group: { _id: null, total: { $sum: "$escrowAmount" }, count: { $sum: 1 } } },
            ]),
        ]);

        return res.status(200).json({
            success: true,
            data: {
                today,
                yesterday,
                currentEscrowHeld: currentEscrowHeld[0]?.total || 0,
                currentEscrowOrderCount: currentEscrowHeld[0]?.count || 0,
                generatedAt: new Date(),
                caveats: {
                    escrowReleasedUsesUpdatedAt: true,
                    escrowReleasedNote: "VendorOrder has no escrowReleasedAt field. updatedAt is used as an approximation — may include non-release updates on the same day.",
                    riderTransferFeeNote: "Rider transferFee is always 0 in the DB (platform absorbs it). Cost is back-computed via calculatePaystackTransferFee(requestedAmount).",
                    timingBasisNote: "commission and serviceFees are recorded at order-payment time. netDeliveryMargin is recorded at delivery-completion time (a different event, possibly a different day). 'Today' therefore mixes two clocks — this is inherent to the ledger design, not a bug.",
                },
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * GET /api/admin/finance/reconciliation
 * Compares internal Admin wallet ledger balance vs all outstanding obligations
 * (escrow held + vendor wallet balances + rider wallet balances).
 * Flags a mismatch if availableAfterObligations < 0.
 *
 * Paystack live balance is fetched separately client-side via the existing
 * getPaystackOverview() endpoint — this endpoint covers internal-system numbers only.
 */
export const getReconciliationSnapshot = async (req, res) => {
    try {
        const [ledgerBalance, escrowHeld, vendorWalletTotal, riderWalletTotal, pendingVendorWithdrawals, pendingRiderWithdrawals] = await Promise.all([
            getAdminWalletBalance(),
            VendorOrder.aggregate([
                { $match: { escrowReleased: false } },
                { $group: { _id: null, total: { $sum: "$escrowAmount" } } },
            ]),
            Wallet.aggregate([
                { $match: { ownerModel: "Vendor" } },
                { $group: { _id: null, total: { $sum: "$balance" } } },
            ]),
            Wallet.aggregate([
                { $match: { ownerModel: "Rider" } },
                { $group: { _id: null, total: { $sum: "$balance" } } },
            ]),
            // Pending/processing vendor withdrawals (wallet debited but not yet settled)
            Withdrawal.aggregate([
                { $match: { status: { $in: ["pending", "processing"] } } },
                { $group: { _id: null, total: { $sum: "$requestedAmount" } } },
            ]),
            // Pending/processing rider withdrawals
            RiderWithdrawal.aggregate([
                { $match: { status: { $in: ["pending", "processing"] } } },
                { $group: { _id: null, total: { $sum: "$requestedAmount" } } },
            ]),
        ]);

        const escrowTotal = escrowHeld[0]?.total || 0;
        const vendorPayables = vendorWalletTotal[0]?.total || 0;
        const riderPayables = riderWalletTotal[0]?.total || 0;
        const pendingVendorPayout = pendingVendorWithdrawals[0]?.total || 0;
        const pendingRiderPayout = pendingRiderWithdrawals[0]?.total || 0;
        const totalOwed = vendorPayables + riderPayables;
        const totalPendingPayouts = pendingVendorPayout + pendingRiderPayout;
        const availableAfterObligations = ledgerBalance - escrowTotal - totalOwed;

        return res.status(200).json({
            success: true,
            data: {
                internalLedgerBalance: ledgerBalance,
                escrowHeld: escrowTotal,
                vendorPayables,
                riderPayables,
                totalOwed,
                pendingVendorPayouts: pendingVendorPayout,
                pendingRiderPayouts: pendingRiderPayout,
                totalPendingPayouts,
                availableAfterObligations,
                flagged: availableAfterObligations < 0,
                generatedAt: new Date(),
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

