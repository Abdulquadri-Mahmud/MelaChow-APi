import mongoose from "mongoose";
import Withdrawal from "../model/wallet/Withdrawal.model.js";
import RiderWithdrawal from "../model/wallet/RiderWithdrawal.model.js";
import Wallet from "../model/wallet/wallet.mode.js";
import { verifyPaystackTransfer } from "./paystackTransfer.service.js";

const TERMINAL_FAILURES = new Set(["failed", "reversed"]);
const IN_FLIGHT = new Set(["pending", "processing", "otp"]);

const sanitizeProviderPayload = (data = {}) => ({
    id: data.id ?? null,
    reference: data.reference ?? null,
    transfer_code: data.transfer_code ?? null,
    amount: data.amount ?? null,
    currency: data.currency ?? null,
    status: data.status ?? null,
    reason: data.reason ?? null,
    failures: data.failures ?? null,
    transferred_at: data.transferred_at ?? null,
    createdAt: data.createdAt ?? data.created_at ?? null,
    updatedAt: data.updatedAt ?? data.updated_at ?? null,
});

export const findWithdrawal = async ({ id, reference, session } = {}) => {
    const query = id ? { _id: id } : { paystackReference: reference };
    let withdrawal = await Withdrawal.findOne(query).session(session || null);
    if (withdrawal) return { withdrawal, type: "vendor", Model: Withdrawal };
    withdrawal = await RiderWithdrawal.findOne(query).session(session || null);
    return withdrawal ? { withdrawal, type: "rider", Model: RiderWithdrawal } : null;
};

const providerFailureReason = (data) =>
    data?.reason || data?.gateway_response || data?.failures?.[0]?.reason || "Transfer failed";

export const applyTransferOutcome = async ({ reference, providerData, source = "webhook" }) => {
    if (!reference) throw new Error("Transfer outcome is missing a reference");
    const providerStatus = String(providerData?.status || "").toLowerCase();
    if (!providerStatus) throw new Error("Transfer outcome is missing a provider status");

    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            const found = await findWithdrawal({ reference, session });
            if (!found) {
                result = { found: false, reference, providerStatus };
                return;
            }

            const { withdrawal } = found;
            const localBefore = withdrawal.status;
            const providerAmount = Number(providerData?.amount);
            const expectedAmount = Math.round(Number(withdrawal.netAmount) * 100);
            const amountMismatch = Number.isFinite(providerAmount) && providerAmount !== expectedAmount;
            let outcome = "matched";

            withdrawal.lastVerifiedAt = new Date();
            withdrawal.providerStatus = providerStatus;
            withdrawal.providerFailureReason = TERMINAL_FAILURES.has(providerStatus) ? providerFailureReason(providerData) : null;
            withdrawal.providerTransferredAt = providerData?.transferred_at ? new Date(providerData.transferred_at) : null;
            withdrawal.lastProviderPayload = sanitizeProviderPayload(providerData);
            withdrawal.reconciliationAttempts = Number(withdrawal.reconciliationAttempts || 0) + 1;

            if (amountMismatch) {
                outcome = "amount_mismatch";
                withdrawal.reconciliationStatus = "amount_mismatch";
            } else if (providerStatus === "success") {
                if (withdrawal.fundsRestoredAt || TERMINAL_FAILURES.has(localBefore)) {
                    outcome = "manual_review";
                    withdrawal.reconciliationStatus = "manual_review";
                    withdrawal.failureReason = "CRITICAL: Paystack reports success after local funds were restored";
                } else {
                    withdrawal.status = "completed";
                    withdrawal.activePayoutKey = undefined;
                    withdrawal.settledAt = providerData?.transferred_at ? new Date(providerData.transferred_at) : new Date();
                    withdrawal.failureReason = null;
                    withdrawal.reconciliationStatus = "matched";
                }
            } else if (TERMINAL_FAILURES.has(providerStatus)) {
                withdrawal.status = providerStatus;
                withdrawal.activePayoutKey = undefined;
                withdrawal.failureReason = providerFailureReason(providerData);
                withdrawal.reconciliationStatus = amountMismatch ? "amount_mismatch" : "matched";

                if (!withdrawal.fundsRestoredAt) {
                    const wallet = await Wallet.findById(withdrawal.walletId).session(session);
                    if (!wallet) throw new Error(`Wallet not found for withdrawal ${withdrawal._id}`);
                    wallet.balance = Number((wallet.balance + withdrawal.requestedAmount).toFixed(2));
                    wallet.totalWithdrawn = Math.max(0, Number((wallet.totalWithdrawn - withdrawal.requestedAmount).toFixed(2)));
                    wallet.transactions.push({
                        type: "credit",
                        amount: withdrawal.requestedAmount,
                        description: `Withdrawal ${providerStatus} — Ref: ${reference}. Funds restored.`,
                        transactionType: "refund",
                    });
                    await wallet.save({ session });
                    withdrawal.fundsRestoredAt = new Date();
                }
            } else if (IN_FLIGHT.has(providerStatus)) {
                if (["completed", "failed", "reversed"].includes(localBefore)) {
                    outcome = "status_mismatch";
                    withdrawal.reconciliationStatus = "status_mismatch";
                } else {
                    withdrawal.status = "processing";
                    withdrawal.reconciliationStatus = amountMismatch ? "amount_mismatch" : "matched";
                }
            } else {
                outcome = "manual_review";
                withdrawal.reconciliationStatus = "manual_review";
            }

            withdrawal.reconciliationHistory.push({
                source,
                localStatus: localBefore,
                providerStatus,
                outcome,
                at: new Date(),
            });
            await withdrawal.save({ session });
            result = { found: true, type: found.type, withdrawal, providerStatus, outcome };
        });
        return result;
    } finally {
        await session.endSession();
    }
};

export const reconcileWithdrawal = async ({ id, reference, source = "manual" }) => {
    const found = await findWithdrawal({ id, reference });
    if (!found) throw new Error("Withdrawal not found");
    const providerData = await verifyPaystackTransfer(found.withdrawal.paystackReference);
    return applyTransferOutcome({
        reference: found.withdrawal.paystackReference,
        providerData,
        source,
    });
};

export const reconcileStaleWithdrawals = async ({ olderThanMinutes = 10, limit = 100 } = {}) => {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const query = { status: { $in: ["pending", "processing"] }, updatedAt: { $lte: cutoff } };
    const [vendorRows, riderRows] = await Promise.all([
        Withdrawal.find(query).sort({ updatedAt: 1 }).limit(limit).select("paystackReference").lean(),
        RiderWithdrawal.find(query).sort({ updatedAt: 1 }).limit(limit).select("paystackReference").lean(),
    ]);

    const rows = [...vendorRows, ...riderRows].slice(0, limit);
    const summary = { checked: 0, reconciled: 0, manualReview: 0, errors: [] };
    for (const row of rows) {
        summary.checked += 1;
        try {
            const result = await reconcileWithdrawal({ reference: row.paystackReference, source: "scheduled" });
            summary.reconciled += 1;
            if (["manual_review", "amount_mismatch", "status_mismatch"].includes(result?.outcome)) summary.manualReview += 1;
        } catch (error) {
            summary.errors.push({ reference: row.paystackReference, message: error.message });
        }
    }
    return summary;
};
