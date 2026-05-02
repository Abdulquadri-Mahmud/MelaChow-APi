import Wallet from "../../model/wallet/wallet.mode.js";
import Withdrawal from "../../model/wallet/Withdrawal.model.js";
import RiderWithdrawal from "../../model/wallet/RiderWithdrawal.model.js";

/**
 * GET /api/admin/finance/wallet-breakdown
 * Returns a live breakdown of the admin wallet composition.
 * All values derived from transaction history — no stored aggregates.
 */
export const getAdminWalletBreakdown = async (req, res) => {
    try {
        const adminWallet = await Wallet.findOne({ ownerModel: "Admin" });
        if (!adminWallet) {
            return res.status(200).json({
                success: true,
                data: {
                    totalBalance: 0,
                    escrowHeld: 0,
                    deliveryFeesCollected: 0,
                    deliverySpreadEarned: 0,
                    platformRevenue: 0,
                    totalRefundsIssued: 0,
                }
            });
        }

        const txns = adminWallet.transactions;

        // Escrow currently held = what was held minus what was released
        const escrowHeld = txns.reduce((acc, t) => {
            if (t.transactionType === 'escrow_hold' && t.type === 'credit') return acc + t.amount;
            if (t.transactionType === 'escrow_release' && t.type === 'debit') return acc - t.amount;
            return acc;
        }, 0);

        // Total delivery fees collected from customers
        const deliveryFeesCollected = txns
            .filter(t => t.transactionType === 'delivery_fee' && t.type === 'credit')
            .reduce((acc, t) => acc + t.amount, 0);

        // Platform's retained spread (₦400 per delivery)
        const deliverySpreadEarned = txns
            .filter(t => t.transactionType === 'delivery_spread' && t.type === 'credit')
            .reduce((acc, t) => acc + Number(t.reportingAmount || t.amount || 0), 0);

        // Total refunds issued
        const totalRefundsIssued = txns
            .filter(t => t.transactionType === 'refund' && t.type === 'debit')
            .reduce((acc, t) => acc + t.amount, 0);

        // Platform revenue = delivery spread + any commission (currently 0) - refunds
        const platformRevenue = deliverySpreadEarned - totalRefundsIssued;

        // Pending payouts: vendor and rider withdrawals currently in-flight
        const [pendingVendorPayouts, pendingRiderPayouts] = await Promise.all([
            Withdrawal.find({ status: { $in: ["pending", "processing"] } }).select("requestedAmount"),
            RiderWithdrawal.find({ status: { $in: ["pending", "processing"] } }).select("requestedAmount"),
        ]);

        const pendingVendorTotal = pendingVendorPayouts.reduce((acc, w) => acc + w.requestedAmount, 0);
        const pendingRiderTotal = pendingRiderPayouts.reduce((acc, w) => acc + w.requestedAmount, 0);

        return res.status(200).json({
            success: true,
            data: {
                totalBalance: adminWallet.balance,
                escrowHeld: Math.max(0, escrowHeld),
                deliveryFeesCollected,
                deliverySpreadEarned,
                platformRevenue: Math.max(0, platformRevenue),
                totalRefundsIssued,
                pendingPayouts: {
                    vendor: pendingVendorTotal,
                    rider: pendingRiderTotal,
                    total: pendingVendorTotal + pendingRiderTotal,
                },
                // Derived: what's genuinely the platform's free cash
                freeCash: Math.max(0, adminWallet.balance - Math.max(0, escrowHeld)),
            }
        });
    } catch (err) {
        console.error("❌ getAdminWalletBreakdown error:", err.message);
        return res.status(500).json({ success: false, message: "Failed to compute wallet breakdown" });
    }
};

/**
 * GET /api/admin/finance/payout-history
 * Returns recent automated payouts for both vendors and riders.
 * Used by admin to monitor daily sweep results.
 */
export const getPayoutHistory = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 50;
        const skip = (page - 1) * limit;
        const search = (req.query.search || "").trim().toLowerCase();
        const { startDate, endDate } = req.query;

        const [vendorPayouts, riderPayouts] = await Promise.all([
            Withdrawal.find()
                .sort({ createdAt: -1 })
                .select("-recipientCode"),
            RiderWithdrawal.find()
                .sort({ createdAt: -1 })
                .select("-recipientCode"),
        ]);

        // Merge and sort by date descending
        let combined = [
            ...vendorPayouts.map(p => ({ ...p.toObject(), actorType: "vendor" })),
            ...riderPayouts.map(p => ({ ...p.toObject(), actorType: "rider" })),
        ];

        if (search) {
            combined = combined.filter((p) =>
                [p.accountName, p.bankName, p.accountNumber, p.status, p.paystackReference, p.actorType]
                    .filter(Boolean)
                    .some((value) => String(value).toLowerCase().includes(search))
            );
        }

        if (startDate || endDate) {
            combined = combined.filter((p) => {
                const createdAt = new Date(p.createdAt);
                return (!startDate || createdAt >= new Date(startDate)) &&
                    (!endDate || createdAt <= new Date(endDate));
            });
        }

        combined.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const total = combined.length;
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
                    totalVendorPayouts: vendorPayouts.length,
                    totalRiderPayouts: riderPayouts.length,
                }
            }
        });
    } catch (err) {
        console.error("❌ getPayoutHistory error:", err.message);
        return res.status(500).json({ success: false, message: "Failed to fetch payout history" });
    }
};
