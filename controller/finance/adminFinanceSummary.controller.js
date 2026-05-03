import Wallet from "../../model/wallet/wallet.mode.js";
import Withdrawal from "../../model/wallet/Withdrawal.model.js";
import RiderWithdrawal from "../../model/wallet/RiderWithdrawal.model.js";

const toNumber = (value) => Number(value || 0);

const buildDateFilter = (startDate, endDate) => {
    const createdAt = {};

    if (startDate) createdAt.$gte = new Date(startDate);
    if (endDate) {
        const end = new Date(endDate);
        if (!Number.isNaN(end.getTime())) {
            end.setHours(23, 59, 59, 999);
            createdAt.$lte = end;
        }
    }

    return Object.keys(createdAt).length ? { createdAt } : {};
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildPayoutFilter = ({ search, startDate, endDate }) => {
    const filter = buildDateFilter(startDate, endDate);

    if (search) {
        const regex = new RegExp(escapeRegex(search), "i");
        filter.$or = [
            { accountName: regex },
            { bankName: regex },
            { accountNumber: regex },
            { status: regex },
            { paystackReference: regex },
        ];
    }

    return filter;
};

const getAdminWalletBalance = async () => {
    const wallet = await Wallet.findOne({ ownerModel: "Admin" }).select("balance").lean();
    return toNumber(wallet?.balance);
};

const getAdminWalletStats = async () => {
    const [stats = {}] = await Wallet.aggregate([
        { $match: { ownerModel: "Admin" } },
        { $unwind: { path: "$transactions", preserveNullAndEmptyArrays: true } },
        {
            $group: {
                _id: "$_id",
                escrowHeld: {
                    $sum: {
                        $switch: {
                            branches: [
                                {
                                    case: {
                                        $and: [
                                            { $eq: ["$transactions.transactionType", "escrow_hold"] },
                                            { $eq: ["$transactions.type", "credit"] },
                                        ],
                                    },
                                    then: "$transactions.amount",
                                },
                                {
                                    case: {
                                        $and: [
                                            { $eq: ["$transactions.transactionType", "escrow_release"] },
                                            { $eq: ["$transactions.type", "debit"] },
                                        ],
                                    },
                                    then: { $multiply: ["$transactions.amount", -1] },
                                },
                            ],
                            default: 0,
                        },
                    },
                },
                deliveryFeesCollected: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $eq: ["$transactions.transactionType", "delivery_fee"] },
                                    { $eq: ["$transactions.type", "credit"] },
                                ],
                            },
                            "$transactions.amount",
                            0,
                        ],
                    },
                },
                deliverySpreadEarned: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $eq: ["$transactions.transactionType", "delivery_spread"] },
                                    { $eq: ["$transactions.type", "credit"] },
                                ],
                            },
                            { $ifNull: ["$transactions.reportingAmount", "$transactions.amount"] },
                            0,
                        ],
                    },
                },
                totalRefundsIssued: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $eq: ["$transactions.transactionType", "refund"] },
                                    { $eq: ["$transactions.type", "debit"] },
                                ],
                            },
                            "$transactions.amount",
                            0,
                        ],
                    },
                },
            },
        },
    ]);

    return {
        escrowHeld: Math.max(0, toNumber(stats.escrowHeld)),
        deliveryFeesCollected: toNumber(stats.deliveryFeesCollected),
        deliverySpreadEarned: toNumber(stats.deliverySpreadEarned),
        totalRefundsIssued: toNumber(stats.totalRefundsIssued),
    };
};

const sumPendingPayouts = (Model) =>
    Model.aggregate([
        { $match: { status: { $in: ["pending", "processing"] } } },
        { $group: { _id: null, total: { $sum: "$requestedAmount" } } },
    ]).then(([row]) => toNumber(row?.total));

const countPayouts = (Model, filter) => Model.countDocuments(filter);

const fetchPayouts = (Model, filter, actorType, take) =>
    Model.find(filter)
        .sort({ createdAt: -1 })
        .limit(take)
        .select("-recipientCode")
        .lean()
        .then((rows) => rows.map((row) => ({ ...row, actorType })));

/**
 * GET /api/admin/finance/wallet-breakdown
 * Returns a live breakdown of the admin wallet composition.
 */
export const getAdminWalletBreakdown = async (req, res) => {
    try {
        const [
            totalBalance,
            walletStats,
            pendingVendorTotal,
            pendingRiderTotal,
        ] = await Promise.all([
            getAdminWalletBalance(),
            getAdminWalletStats(),
            sumPendingPayouts(Withdrawal),
            sumPendingPayouts(RiderWithdrawal),
        ]);

        const platformRevenue = walletStats.deliverySpreadEarned - walletStats.totalRefundsIssued;
        const pendingTotal = pendingVendorTotal + pendingRiderTotal;

        return res.status(200).json({
            success: true,
            data: {
                totalBalance,
                escrowHeld: walletStats.escrowHeld,
                deliveryFeesCollected: walletStats.deliveryFeesCollected,
                deliverySpreadEarned: walletStats.deliverySpreadEarned,
                platformRevenue: Math.max(0, platformRevenue),
                totalRefundsIssued: walletStats.totalRefundsIssued,
                pendingPayouts: {
                    vendor: pendingVendorTotal,
                    rider: pendingRiderTotal,
                    total: pendingTotal,
                },
                freeCash: Math.max(0, totalBalance - walletStats.escrowHeld),
            },
        });
    } catch (err) {
        console.error("getAdminWalletBreakdown error:", err.message);
        return res.status(500).json({ success: false, message: "Failed to compute wallet breakdown" });
    }
};

/**
 * GET /api/admin/finance/payout-history
 * Returns recent automated payouts for both vendors and riders.
 */
export const getPayoutHistory = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = 50;
        const skip = (page - 1) * limit;
        const search = (req.query.search || "").trim();
        const { startDate, endDate } = req.query;
        const baseFilter = buildPayoutFilter({ search, startDate, endDate });
        const take = skip + limit;

        const [vendorTotal, riderTotal, vendorPayouts, riderPayouts] = await Promise.all([
            countPayouts(Withdrawal, baseFilter),
            countPayouts(RiderWithdrawal, baseFilter),
            fetchPayouts(Withdrawal, baseFilter, "vendor", take),
            fetchPayouts(RiderWithdrawal, baseFilter, "rider", take),
        ]);

        const combined = [...vendorPayouts, ...riderPayouts]
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const total = vendorTotal + riderTotal;
        const payouts = combined.slice(skip, skip + limit);

        return res.status(200).json({
            success: true,
            data: {
                payouts,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                    totalVendorPayouts: vendorTotal,
                    totalRiderPayouts: riderTotal,
                },
            },
        });
    } catch (err) {
        console.error("getPayoutHistory error:", err.message);
        return res.status(500).json({ success: false, message: "Failed to fetch payout history" });
    }
};
