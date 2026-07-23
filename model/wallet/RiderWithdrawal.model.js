import mongoose from "mongoose";

/**
 * RiderWithdrawal — mirrors Withdrawal.model.js but for riders.
 * Kept separate to avoid modifying the vendor withdrawal model
 * and risking regressions in the existing vendor payout flow.
 *
 * Webhook handlers in order.controller.js check this collection
 * when a transfer reference is not found in the Withdrawal collection.
 */
const riderWithdrawalSchema = new mongoose.Schema(
    {
        riderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Rider",
            required: true,
            index: true,
        },
        walletId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Wallet",
            required: true,
        },
        requestedAmount: {
            type: Number,
            required: true,
        },
        transferFee: {
            type: Number,
            default: 0,
        },
        netAmount: {
            type: Number,
            required: true,
        },
        status: {
            type: String,
            enum: ["pending", "processing", "completed", "failed", "reversed"],
            default: "pending",
            index: true,
        },
        paystackReference: {
            type: String,
            unique: true,
            required: true,
        },
        retryOf: { type: mongoose.Schema.Types.ObjectId, ref: "RiderWithdrawal", unique: true, sparse: true },
        activePayoutKey: { type: String, unique: true, sparse: true },
        paystackTransferCode: {
            type: String,
            default: null,
        },
        recipientCode: {
            type: String,
            required: true,
        },
        bankName:      { type: String, default: "" },
        accountNumber: { type: String, default: "" },
        accountName:   { type: String, default: "" },
        failureReason: { type: String, default: null },
        initiatedAt:   { type: Date, default: Date.now },
        walletDebitedAt: { type: Date, default: null },
        settledAt:     { type: Date, default: null },
        fundsRestoredAt: { type: Date, default: null },
        lastVerifiedAt: { type: Date, default: null },
        providerStatus: { type: String, default: null },
        providerFailureReason: { type: String, default: null },
        providerTransferredAt: { type: Date, default: null },
        reconciliationStatus: { type: String, enum: ["unverified", "matched", "status_mismatch", "amount_mismatch", "manual_review"], default: "unverified", index: true },
        reconciliationAttempts: { type: Number, default: 0 },
        lastProviderPayload: { type: mongoose.Schema.Types.Mixed, default: null },
        reconciliationHistory: [{ source: String, localStatus: String, providerStatus: String, outcome: String, at: { type: Date, default: Date.now } }],
    },
    { timestamps: true }
);

riderWithdrawalSchema.index({ riderId: 1, status: 1 });
export default mongoose.model("RiderWithdrawal", riderWithdrawalSchema);
