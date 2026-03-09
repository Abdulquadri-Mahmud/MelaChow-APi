import Wallet from "../../../model/wallet/wallet.mode.js";
import Order from "../../../model/order/Order.js";
import VendorOrder from "../../../model/vendor/VendorOrder.js";
import Vendor from "../../../model/vendor/vendor.model.js";
import mongoose from "mongoose";

/**
 * GET REVENUE SUMMARY
 * Route: GET /api/admin/finance/summary
 */
export const getRevenueSummary = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        // 1. Commission Earned (from paid VendorOrders)
        const commissionStats = await VendorOrder.aggregate([
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
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: null,
                    totalCommissionEarned: { $sum: "$commission" }
                }
            }
        ]);

        // 2. Admin Wallet Stats
        const adminWallet = await Wallet.findOne({ ownerModel: "Admin" }).lean();

        // Compute debits/credits from transaction array (filtering by date if provided)
        let totalCredits = 0;
        let totalDebits = 0;

        if (adminWallet && adminWallet.transactions) {
            adminWallet.transactions.forEach(tx => {
                const txDate = new Date(tx.date);
                const inRange = (!startDate || txDate >= new Date(startDate)) &&
                    (!endDate || txDate <= new Date(endDate));
                if (inRange) {
                    if (tx.type === "credit") totalCredits += tx.amount;
                    else if (tx.type === "debit") totalDebits += tx.amount;
                }
            });
        }

        // 3. Order Revenue & Delivery Fees
        const orderStats = await Order.aggregate([
            { $match: { paymentStatus: "paid", ...dateFilter } },
            {
                $group: {
                    _id: null,
                    totalOrderRevenue: { $sum: "$total" },
                    totalDeliveryFeesCollected: { $sum: "$deliveryFee" }
                }
            }
        ]);

        // 4. Platform Delivery Revenue (Platform-Managed Vendors only)
        const platformDeliveryStats = await VendorOrder.aggregate([
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
                    "vendor.deliveryManagedBy": "admin",
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: null,
                    totalPlatformDeliveryRevenue: { $sum: "$deliveryShare" }
                }
            }
        ]);

        const commEarned = commissionStats[0]?.totalCommissionEarned || 0;
        const delivRevenue = platformDeliveryStats[0]?.totalPlatformDeliveryRevenue || 0;

        res.status(200).json({
            success: true,
            data: {
                currentPlatformBalance: adminWallet?.balance || 0,
                totalCommissionEarned: commEarned,
                totalPlatformDeliveryRevenue: delivRevenue,
                combinedPlatformRevenue: commEarned + delivRevenue,
                totalOrderRevenue: orderStats[0]?.totalOrderRevenue || 0,
                totalDeliveryFeesCollected: orderStats[0]?.totalDeliveryFeesCollected || 0,
                totalCredits,
                totalDebits,
                period: { startDate, endDate }
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

        let dateFormat = "%Y-%m-%d";
        let daysToLookBack = 7;
        let groupType = "day";

        if (period === "30days") {
            daysToLookBack = 30;
        } else if (period === "3months") {
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
                    platformDeliveryShare: {
                        $cond: [
                            { $eq: ["$vendor.deliveryManagedBy", "admin"] },
                            "$deliveryShare",
                            0
                        ]
                    },
                    userOrderId: 1,
                    label: { $dateToString: { format: dateFormat, date: "$createdAt" } }
                }
            },
            {
                $group: {
                    _id: "$label",
                    commission: { $sum: "$commission" },
                    deliveryRevenue: { $sum: "$platformDeliveryShare" },
                    orderCount: { $addToSet: "$userOrderId" }
                }
            },
            {
                $project: {
                    label: "$_id",
                    commission: 1,
                    deliveryRevenue: 1,
                    totalRevenue: { $add: ["$commission", "$deliveryRevenue"] },
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

        let allTransactions = [...wallet.transactions];

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

        if (type) {
            filtered = filtered.filter(tx => tx.type === type);
        }
        if (startDate) {
            filtered = filtered.filter(tx => new Date(tx.date) >= new Date(startDate));
        }
        if (endDate) {
            filtered = filtered.filter(tx => new Date(tx.date) <= new Date(endDate));
        }
        if (search) {
            const s = search.toLowerCase();
            filtered = filtered.filter(tx => tx.description?.toLowerCase().includes(s));
        }

        // Sort descending for response
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        // 3. Paginate
        const total = filtered.length;
        const startIndex = (parseInt(page) - 1) * parseInt(limit);
        const paginatedSlice = filtered.slice(startIndex, startIndex + parseInt(limit));

        // 4. Batch Populate Orders
        const orderIds = paginatedSlice
            .filter(tx => tx.orderId)
            .map(tx => tx.orderId);

        const orders = await Order.find({ _id: { $in: orderIds } })
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

        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
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
                    ...dateFilter
                }
            },
            {
                $group: {
                    _id: "$restaurantId",
                    orderCount: { $sum: 1 },
                    commissionPaid: { $sum: "$commission" },
                    vendorEarnings: { $sum: "$vendorTotal" },
                    deliveryShareGenerated: { $sum: "$deliveryShare" },
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
                    deliveryManagedBy: "$vendorInfo.deliveryManagedBy",
                    orderCount: 1,
                    totalSubtotal: 1,
                    commissionPaid: 1,
                    vendorEarnings: 1,
                    deliveryShareGenerated: 1
                }
            },
            { $sort: { commissionPaid: -1 } },
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
