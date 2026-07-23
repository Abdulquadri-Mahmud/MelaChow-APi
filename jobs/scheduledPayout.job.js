import { Queue, Worker } from "bullmq";
import { randomUUID } from "crypto";
import Vendor from "../model/vendor/vendor.model.js";
import Rider from "../model/rider.model.js";
import Wallet from "../model/wallet/wallet.mode.js";
import Withdrawal from "../model/wallet/Withdrawal.model.js";
import RiderWithdrawal from "../model/wallet/RiderWithdrawal.model.js";
import {
    checkPaystackBalance,
    initiatePaystackTransfer,
} from "../services/paystackTransfer.service.js";
import PlatformConfig from "../model/platform/PlatformConfig.model.js";
import { calcVendorNetPayout } from "../utils/paystackFees.js";
import { RIDER_PAYOUT_THRESHOLD, VENDOR_PAYOUT_THRESHOLD } from "../config/payouts.js";

// ── REDIS CONNECTION ───────────────────────────────────────────────────────────
import { bullmqRedisConnection } from "../config/redis.js";

const QUEUE_NAME = "scheduled-payout";

// Reads the minimum payout balance from PlatformConfig.
// Falls back to ₦500 (rider-friendly default) if the config doc is missing.
const getMinPayoutBalance = async () => {
    try {
        const config = await PlatformConfig.findOne({ type: "singleton" }).lean();
        return config?.riderMinPayoutBalance ?? 500;
    } catch {
        return 500;
    }
};

// NOTE: Paystack deducts its own transfer fee (NGN 100/NGN 200/NGN 300) directly from the
// MelaChow Paystack balance — NOT from the transfer amount the recipient receives.
// We therefore send the rider's FULL wallet balance and record transferFee: 0 on
// our side. The rider receives the exact amount we debit from their wallet.

// ── Queue & Scheduler ─────────────────────────────────────────────────────────
export const scheduledPayoutQueue = new Queue(QUEUE_NAME, {
    connection: bullmqRedisConnection,
    defaultJobOptions: {
        // ── LOOPHOLE 5 FIX ────────────────────────────────────────────────────
        // attempts: was 2 — audit requires minimum 3 for financial operations
        // removeOnFail: was true — silently deleted failed payout jobs with no
        //   audit trail. Now false: failed jobs remain in the BullMQ failed set
        //   so ops can inspect, replay, or alert on them.
        attempts: 3,
        backoff: { type: "exponential", delay: 30000 },
        removeOnComplete: true,
        removeOnFail: false,
    },
});


// ── Worker — processes each individual payout job ────────────────────────────
const processPayoutJob = async (job) => {
    const {
        actorId,
        actorType,
        walletId,
        recipientCode,
        displayName,
        bankName,
        accountNumber,
        accountName,
    } = job.data;

    const Model = actorType === "vendor" ? Withdrawal : RiderWithdrawal;
    const idField = actorType === "vendor" ? "vendorId" : "riderId";

    console.log(`🔄 [ScheduledPayout] Processing ${actorType} ${actorId}`);

    // 1. Guard: skip if a withdrawal is already in-flight
    const inFlight = await Model.findOne({
        [idField]: actorId,
        status: { $in: ["pending", "processing"] },
    });
    if (inFlight) {
        console.log(`⏭️ Skipping ${actorType} ${actorId} — in-flight withdrawal exists`);
        return { skipped: true, reason: "in-flight withdrawal exists" };
    }

    // 2. Re-fetch live wallet balance (race condition safety)
    const wallet = await Wallet.findById(walletId);
    const threshold = actorType === "vendor" ? VENDOR_PAYOUT_THRESHOLD : RIDER_PAYOUT_THRESHOLD;
    if (!wallet || wallet.balance < threshold) {
        console.log(`⏭️ Skipping ${actorType} ${actorId} — balance too low at processing time (balance: ₦${wallet?.balance ?? 0}, threshold: ₦${threshold})`);
        return { skipped: true, reason: "balance insufficient at processing time" };
    }

    const actualAmount = Math.floor(wallet.balance); // Whole naira only
    let netAmount = actualAmount;
    let transferFee = 0;

    if (actorType === "vendor") {
        const vendorNet = calcVendorNetPayout(actualAmount);
        netAmount = vendorNet.net;
        transferFee = vendorNet.fee;
    }

    if (netAmount <= 0) {
        console.log(`⏭️ Skipping ${actorType} ${actorId} — net amount is zero or negative after fees (netAmount: ₦${netAmount})`);
        return { skipped: true, reason: "net amount is zero or negative after fees" };
    }

    const paystackReference = `AUTO_${actorType.toUpperCase()}_${randomUUID()
        .replace(/-/g, "")
        .toUpperCase()}`;

    // 3. Check Paystack platform balance (must cover transfer + Paystack's own fee)
    const { sufficient } = await checkPaystackBalance(netAmount * 100);
    if (!sufficient) {
        console.error(
            `❌ [ScheduledPayout] Insufficient Paystack platform balance for ${actorType} ${actorId}. REQUIRES MANUAL REVIEW.`
        );
        throw new Error("Insufficient Paystack platform balance"); // BullMQ will retry
    }

    // 4. Create withdrawal document
    const withdrawalDoc = await Model.create({
        [idField]: actorId,
        walletId: wallet._id,
        requestedAmount: actualAmount,
        transferFee, // Save calculated transfer fee
        netAmount,   // Save net amount
        status: "pending",
        paystackReference,
        recipientCode,
        bankName: bankName || "",
        accountNumber: accountNumber || "",
        accountName: accountName || "",
        activePayoutKey: `${actorType}:${actorId}`,
    });

    // 5. Debit wallet immediately
    await Wallet.findByIdAndUpdate(wallet._id, {
        $inc: { balance: -actualAmount, totalWithdrawn: actualAmount },
        $push: {
            transactions: {
                type: "debit",
                amount: actualAmount,
                description: `Scheduled auto-payout — Ref: ${paystackReference}`,
                transactionType: "withdrawal",
                date: new Date(),
            },
        },
    });
    await Model.findByIdAndUpdate(withdrawalDoc._id, { walletDebitedAt: new Date() });

    // 6. Call Paystack Transfer API
    try {
        const { transferCode } = await initiatePaystackTransfer({
            recipientCode,
            amountKobo: netAmount * 100,
            reference: paystackReference,
            reason: `MelaChow auto-payout — ${displayName}`,
        });

        await Model.findByIdAndUpdate(withdrawalDoc._id, {
            status: "processing",
            paystackTransferCode: transferCode,
        });

        console.log(
            `✅ [ScheduledPayout] ${actorType} ${actorId} | ₦${actualAmount} (Net: ₦${netAmount}, Fee: ₦${transferFee}) | ref: ${paystackReference}`
        );
        return { success: true, reference: paystackReference, amount: actualAmount };

    } catch (paystackErr) {
        const uncertainOutcome = !paystackErr.response || paystackErr.response.status >= 500;
        if (uncertainOutcome) {
            await Model.findByIdAndUpdate(withdrawalDoc._id, {
                status: "processing",
                reconciliationStatus: "manual_review",
                failureReason: "Transfer submission outcome is unknown; funds remain reserved pending reconciliation",
            });
            console.error(`Paystack transfer outcome uncertain for ${paystackReference}; queued for reconciliation`);
            return { success: true, uncertain: true, reference: paystackReference };
        }
        // Rollback: restore wallet balance
        await Wallet.findByIdAndUpdate(wallet._id, {
            $inc: { balance: actualAmount, totalWithdrawn: -actualAmount },
            $pull: {
                transactions: {
                    description: `Scheduled auto-payout — Ref: ${paystackReference}`,
                },
            },
        });

        await Model.findByIdAndUpdate(withdrawalDoc._id, {
            $set: {
                status: "failed",
                failureReason: paystackErr.response?.data?.message || "Paystack API error during scheduled payout",
            },
            $unset: { activePayoutKey: 1 },
        });

        console.error(
            `❌ [ScheduledPayout] Paystack error for ${actorType} ${actorId}:`,
            paystackErr.response?.data || paystackErr.message
        );
        throw paystackErr; // BullMQ will retry per job config
    }
};

export const scheduledPayoutWorker = new Worker(QUEUE_NAME, processPayoutJob, {
    connection: bullmqRedisConnection,
    concurrency: 5,
});

scheduledPayoutWorker.on("completed", (job, result) => {
    if (result?.skipped) {
        console.log(`⏭️ [ScheduledPayout] Job ${job.id} skipped: ${result.reason}`);
    } else {
        console.log(`✅ [ScheduledPayout] Job ${job.id} done: ${result?.reference}`);
    }
});

scheduledPayoutWorker.on("failed", (job, err) => {
    console.error(`❌ [ScheduledPayout] Job ${job?.id} failed: ${err.message}`);
});

const enqueueVendorPayouts = async (today) => {
    let vendorCount = 0;

    const vendorWallets = await Wallet.find({
        ownerModel: "Vendor",
        balance: { $gte: VENDOR_PAYOUT_THRESHOLD },
    }).select("_id ownerId balance");

    for (const wallet of vendorWallets) {
        try {
            const vendor = await Vendor.findById(wallet.ownerId).select("+payoutDetails");
            if (!vendor?.payoutDetails?.payoutEnabled || !vendor?.payoutDetails?.recipientCode) {
                continue;
            }

            const hasActive = await Withdrawal.exists({
                vendorId: wallet.ownerId,
                status: { $in: ["pending", "processing"] },
            });
            if (hasActive) continue;

            await scheduledPayoutQueue.add(
                `vendor-${wallet.ownerId}`,
                {
                    actorId: wallet.ownerId.toString(),
                    actorType: "vendor",
                    walletId: wallet._id.toString(),
                    recipientCode: vendor.payoutDetails.recipientCode,
                    displayName: vendor.storeName || "Vendor",
                    bankName: vendor.payoutDetails.bankName || "",
                    accountNumber: vendor.payoutDetails.accountNumber || "",
                    accountName: vendor.payoutDetails.accountName || "",
                },
                {
                    jobId: `vendor-payout-${wallet.ownerId}-${today}`,
                }
            );
            vendorCount++;
        } catch (err) {
            console.error(
                `❌ [ScheduledPayout] Failed to enqueue vendor ${wallet.ownerId}:`,
                err.message
            );
        }
    }

    return vendorCount;
};

const enqueueRiderPayouts = async (today) => {
    let riderCount = 0;

    const riderWallets = await Wallet.find({
        ownerModel: "Rider",
        balance: { $gte: RIDER_PAYOUT_THRESHOLD },
    }).select("_id ownerId balance");

    for (const wallet of riderWallets) {
        try {
            const rider = await Rider.findById(wallet.ownerId).select(
                "+payoutDetails.recipientCode"
            );
            if (!rider?.payoutDetails?.payoutEnabled || !rider?.payoutDetails?.recipientCode) {
                continue;
            }

            const hasActive = await RiderWithdrawal.exists({
                riderId: wallet.ownerId,
                status: { $in: ["pending", "processing"] },
            });
            if (hasActive) continue;

            await scheduledPayoutQueue.add(
                `rider-${wallet.ownerId}`,
                {
                    actorId: wallet.ownerId.toString(),
                    actorType: "rider",
                    walletId: wallet._id.toString(),
                    recipientCode: rider.payoutDetails.recipientCode,
                    displayName: rider.name || "Rider",
                    bankName: rider.payoutDetails.bankName || "",
                    accountNumber: rider.payoutDetails.accountNumber || "",
                    accountName: rider.payoutDetails.accountName || "",
                },
                {
                    jobId: `rider-payout-${wallet.ownerId}-${today}`,
                }
            );
            riderCount++;
        } catch (err) {
            console.error(
                `❌ [ScheduledPayout] Failed to enqueue rider ${wallet.ownerId}:`,
                err.message
            );
        }
    }

    return riderCount;
};

// ── Trigger functions — riders at 7:30 PM WAT, vendors at 8 PM WAT ───────────
/**
 * Finds actors with balance >= ₦0 and a verified bank account,
 * then enqueues one BullMQ job per actor.
 * jobId deduplication ensures only one job per actor per calendar day.
 */
export const triggerScheduledPayouts = async (actorType = "all") => {
    console.log(`🕗 [ScheduledPayout] Starting ${actorType} payout sweep...`);
    const today = new Date().toDateString(); // e.g. "Sat Apr 19 2026"

    // Clean old completed/failed jobs from Redis to release deduplication locks for retries
    try {
        await scheduledPayoutQueue.clean(0, 1000, "completed");
        await scheduledPayoutQueue.clean(0, 1000, "failed");
        console.log(`🕗 [ScheduledPayout] Cleaned old completed/failed queue jobs from Redis`);
    } catch (cleanErr) {
        console.warn(`⚠️ [ScheduledPayout] Failed to clean queue: ${cleanErr.message}`);
    }

    try {
        console.log(`🕗 [ScheduledPayout] Thresholds: Rider: ₦${RIDER_PAYOUT_THRESHOLD}, Vendor: ₦${VENDOR_PAYOUT_THRESHOLD}`);

        let vendorCount = 0;
        let riderCount = 0;

        if (actorType === "vendor" || actorType === "all") {
            vendorCount = await enqueueVendorPayouts(today);
        }

        if (actorType === "rider" || actorType === "all") {
            riderCount = await enqueueRiderPayouts(today);
        }

        console.log(
            `✅ [ScheduledPayout] Sweep complete — ${vendorCount} vendor(s), ${riderCount} rider(s) enqueued`
        );
    } catch (err) {
        console.error("❌ [ScheduledPayout] Critical sweep error:", err.message);
    }
};
