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

// ── REDIS CONNECTION ───────────────────────────────────────────────────────────
import { bullmqRedisConnection } from "../config/redis.js";

const QUEUE_NAME = "scheduled-payout";
const MIN_PAYOUT_BALANCE = 1500; // ₦1,500 minimum to trigger auto-payout

const getTransferFee = (amount) => {
    if (amount <= 5000) return 10;
    if (amount <= 50000) return 25;
    return 50;
};

// ── Queue & Scheduler ─────────────────────────────────────────────────────────
export const scheduledPayoutQueue = new Queue(QUEUE_NAME, {
    connection: bullmqRedisConnection,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 30000 },
        removeOnComplete: 50,
        removeOnFail: 100,
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
    if (!wallet || wallet.balance < MIN_PAYOUT_BALANCE) {
        console.log(`⏭️ Skipping ${actorType} ${actorId} — balance too low at processing time`);
        return { skipped: true, reason: "balance insufficient at processing time" };
    }

    const actualAmount = Math.floor(wallet.balance); // Whole naira only
    const transferFee = getTransferFee(actualAmount);
    const netAmount = actualAmount - transferFee;
    const paystackReference = `AUTO_${actorType.toUpperCase()}_${randomUUID()
        .replace(/-/g, "")
        .toUpperCase()}`;

    // 3. Check Paystack platform balance
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
        transferFee,
        netAmount,
        status: "pending",
        paystackReference,
        recipientCode,
        bankName: bankName || "",
        accountNumber: accountNumber || "",
        accountName: accountName || "",
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
            `✅ [ScheduledPayout] ${actorType} ${actorId} | ₦${actualAmount} | ref: ${paystackReference}`
        );
        return { success: true, reference: paystackReference, amount: actualAmount };

    } catch (paystackErr) {
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
            status: "failed",
            failureReason:
                paystackErr.response?.data?.message || "Paystack API error during scheduled payout",
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

// ── Trigger function — called by cron at 8 PM WAT ────────────────────────────
/**
 * Finds all vendors and riders with balance >= ₦1,500 and a verified
 * bank account, then enqueues one BullMQ job per actor.
 * jobId deduplication ensures only one job per actor per calendar day.
 */
export const triggerScheduledPayouts = async () => {
    console.log("🕗 [ScheduledPayout] Starting 8 PM payout sweep...");

    let vendorCount = 0;
    let riderCount = 0;
    const today = new Date().toDateString(); // e.g. "Sat Apr 19 2026"

    try {
        // ── Vendors ───────────────────────────────────────────────────────────
        const vendorWallets = await Wallet.find({
            ownerModel: "Vendor",
            balance: { $gte: MIN_PAYOUT_BALANCE },
        }).select("_id ownerId balance");

        for (const wallet of vendorWallets) {
            try {
                const vendor = await Vendor.findById(wallet.ownerId).select("+payoutDetails");
                if (!vendor?.payoutDetails?.payoutEnabled || !vendor?.payoutDetails?.recipientCode) {
                    continue; // No verified bank — skip silently
                }

                // Skip if a withdrawal is already in progress
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
                        // BullMQ deduplicates by jobId — safe to call triggerScheduledPayouts
                        // multiple times without double-paying anyone
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

        // ── Riders ────────────────────────────────────────────────────────────
        const riderWallets = await Wallet.find({
            ownerModel: "Rider",
            balance: { $gte: MIN_PAYOUT_BALANCE },
        }).select("_id ownerId balance");

        for (const wallet of riderWallets) {
            try {
                const rider = await Rider.findById(wallet.ownerId).select(
                    "+payoutDetails.recipientCode payoutDetails"
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

        console.log(
            `✅ [ScheduledPayout] Sweep complete — ${vendorCount} vendor(s), ${riderCount} rider(s) enqueued`
        );
    } catch (err) {
        console.error("❌ [ScheduledPayout] Critical sweep error:", err.message);
    }
};
