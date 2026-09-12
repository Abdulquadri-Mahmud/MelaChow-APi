import axios from "axios";
import { randomUUID } from "crypto";
import Rider from "../../model/rider.model.js";
import Wallet from "../../model/wallet/wallet.mode.js";
import RiderWithdrawal from "../../model/wallet/RiderWithdrawal.model.js";
import { usePostgresPayoutWrites, usePostgresWalletReads } from "../../services/postgres/compat.js";
import { walletRepository } from "../../services/postgres/wallet.repository.js";
import { checkPaystackBalance, initiatePaystackTransfer } from "../../services/paystackTransfer.service.js";
import { payoutRepository } from "../../services/postgres/payout.repository.js";
import { getNextPayoutWindowMessage } from "../../utils/payoutSchedule.js";
import { getPlatformConfig } from "../../services/platformConfig.service.js";
import { getEffectiveFeeConfig, computeActorPayout } from "../../utils/paystackFees.js";

/**
 * ─── STEP 1: Resolve bank account name ───────────────────────────────────────
 * Calls Paystack to verify the account number belongs to the stated bank.
 * Called before saving anything — lets rider confirm the name before committing.
 *
 * GET /riders/:riderId/payout/resolve-account
 * Query: ?accountNumber=0123456789&bankCode=058
 */
export const resolveAccountName = async (req, res) => {
    try {
        const { riderId } = req.params;

        if (req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const { accountNumber, bankCode } = req.query;

        if (!accountNumber || !bankCode) {
            return res.status(400).json({
                success: false,
                message: "accountNumber and bankCode are required"
            });
        }

        const response = await axios.get(
            `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                },
            }
        );

        const data = response.data?.data;
        if (!data) {
            return res.status(400).json({
                success: false,
                message: "Could not resolve account. Please check the account number and bank."
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                accountName: data.account_name,
                accountNumber: data.account_number,
                bankCode,
            }
        });

    } catch (err) {
        const paystackMessage = err.response?.data?.message;
        return res.status(400).json({
            success: false,
            message: paystackMessage || "Account resolution failed. Check the account number and try again."
        });
    }
};

/**
 * ─── STEP 2: Save bank account ───────────────────────────────────────────────
 * Creates a Paystack transfer recipient and stores the recipientCode on the rider.
 * Must be done before any withdrawal can be initiated.
 *
 * POST /riders/:riderId/payout/bank-account
 * Body: { accountNumber, bankCode, bankName }
 */
export const saveBankAccount = async (req, res) => {
    try {
        const { riderId } = req.params;

        if (req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const { accountNumber, bankCode, bankName } = req.body;

        if (!accountNumber || !bankCode || !bankName) {
            return res.status(400).json({
                success: false,
                message: "accountNumber, bankCode, and bankName are required"
            });
        }

        if (usePostgresPayoutWrites()) {
            const localBypass = process.env.NODE_ENV !== "production" && process.env.LOCAL_VENDOR_PAYOUT_BYPASS === "true";
            let accountName = "Local Test Account", recipientCode = `local_rider_${bankCode}_${String(accountNumber).slice(-4)}`;
            if (!localBypass) {
                try {
                    const resolveResp = await axios.get(`https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } });
                    accountName = resolveResp.data?.data?.account_name;
                    if (!accountName) throw new Error("Account name not returned");
                } catch { return res.status(400).json({ success: false, message: "Could not verify bank account. Please check the details and try again." }); }
                try {
                    const recipientResp = await axios.post("https://api.paystack.co/transferrecipient", { type: "nuban", name: accountName, account_number: accountNumber, bank_code: bankCode, currency: "NGN" }, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" } });
                    recipientCode = recipientResp.data?.data?.recipient_code;
                    if (!recipientCode) throw new Error("recipient_code not returned");
                } catch { return res.status(502).json({ success: false, message: "Failed to register bank account with payment provider. Please try again." }); }
            }
            const payoutDetails = { bankCode, bankName, accountNumber, accountName, recipientCode, payoutEnabled: true };
            const rider = await payoutRepository.updateOwnerPayoutDetails("rider", riderId, payoutDetails);
            if (!rider) return res.status(404).json({ success: false, message: "Rider not found" });
            return res.status(200).json({ success: true, message: "Bank account saved successfully", data: { bankName, accountNumber, accountName, payoutEnabled: true } });
        }

        const rider = await Rider.findById(riderId).select("+payoutDetails.recipientCode");
        if (!rider) {
            return res.status(404).json({ success: false, message: "Rider not found" });
        }

        // Resolve account name from Paystack before creating recipient
        let accountName;
        try {
            const resolveResp = await axios.get(
                `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
                {
                    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
                }
            );
            accountName = resolveResp.data?.data?.account_name;
            if (!accountName) throw new Error("Account name not returned");
        } catch (resolveErr) {
            return res.status(400).json({
                success: false,
                message: "Could not verify bank account. Please check the details and try again."
            });
        }

        // Create Paystack transfer recipient
        let recipientCode;
        try {
            const recipientResp = await axios.post(
                "https://api.paystack.co/transferrecipient",
                {
                    type: "nuban",
                    name: accountName,
                    account_number: accountNumber,
                    bank_code: bankCode,
                    currency: "NGN",
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                        "Content-Type": "application/json",
                    }
                }
            );
            recipientCode = recipientResp.data?.data?.recipient_code;
            if (!recipientCode) throw new Error("recipient_code not returned");
        } catch (recipientErr) {
            return res.status(502).json({
                success: false,
                message: "Failed to register bank account with payment provider. Please try again."
            });
        }

        // Save to rider
        rider.payoutDetails = {
            bankCode,
            bankName,
            accountNumber,
            accountName,
            recipientCode,
            payoutEnabled: true,
        };
        await rider.save();

        return res.status(200).json({
            success: true,
            message: "Bank account saved successfully",
            data: {
                bankName,
                accountNumber,
                accountName,
                payoutEnabled: true,
            }
        });

    } catch (err) {
        console.error("❌ saveBankAccount error:", err.message);
        return res.status(500).json({
            success: false,
            message: "Failed to save bank account"
        });
    }
};

const initiatePostgresRiderWithdrawal = async (req, res, amount) => {
    const context = await payoutRepository.getOwnerContext("rider", req.rider._id);
    if (!context) return res.status(404).json({ success: false, message: "Rider or wallet not found" });
    const details = context.owner.payoutDetails && typeof context.owner.payoutDetails === "object" ? context.owner.payoutDetails : {};
    if (!details.payoutEnabled || !details.recipientCode) return res.status(400).json({ success: false, message: "No verified bank account on file. Please add a bank account before withdrawing." });
    const payoutCalc = computeActorPayout("rider", amount, getEffectiveFeeConfig("rider", context.owner, await getPlatformConfig()));
    if (payoutCalc.net <= 0) return res.status(400).json({ success: false, message: "Withdrawal amount too small after fees" });
    const localBypass = process.env.NODE_ENV !== "production" && process.env.LOCAL_VENDOR_PAYOUT_BYPASS === "true";
    if (!localBypass) {
        try {
            const { sufficient } = await checkPaystackBalance(Math.round(payoutCalc.net * 100));
            if (!sufficient) return res.status(400).json({ success: false, code: "PAYSTACK_BALANCE_PENDING_SETTLEMENT", message: getNextPayoutWindowMessage().message });
        } catch { return res.status(503).json({ success: false, message: "Could not verify payout availability right now. Please try again shortly." }); }
    }
    const reference = `RWD_${randomUUID().replace(/-/g, "").toUpperCase()}`;
    const reserved = await payoutRepository.reserveWithdrawal({ type: "rider", tokenId: req.rider._id, requestedAmountNaira: amount, transferFeeNaira: payoutCalc.feeChargedToActor, netAmountNaira: payoutCalc.net, appliedMarkupNaira: payoutCalc.markupChargedToActor, reference });
    if (reserved.error === "insufficient_balance") return res.status(400).json({ success: false, message: `Insufficient balance. Available: ₦${reserved.balance.toLocaleString()}` });
    if (reserved.error === "payout_in_progress") return res.status(400).json({ success: false, message: "You already have a withdrawal in progress. Please wait for it to complete." });
    if (reserved.error === "cooldown") return res.status(429).json({ success: false, message: `Withdrawal cooldown active. You can withdraw again in ${reserved.hoursRemaining} hour${reserved.hoursRemaining !== 1 ? "s" : ""}.` });
    if (reserved.error) return res.status(400).json({ success: false, message: "Unable to reserve withdrawal" });
    if (localBypass) {
        const withdrawal = await payoutRepository.markProcessing("rider", reference, { transferCode: `local_${reference}`, providerStatus: "local_test" });
        return res.status(200).json({ success: true, message: "Local test withdrawal reserved successfully", data: withdrawal });
    }
    try {
        const provider = await initiatePaystackTransfer({ recipientCode: details.recipientCode, amountKobo: Math.round(payoutCalc.net * 100), reference, reason: `MelaChow rider payout — ${context.owner.name}` });
        const withdrawal = await payoutRepository.markProcessing("rider", reference, { transferCode: provider.transferCode, providerStatus: provider.status });
        return res.status(200).json({ success: true, message: "Withdrawal initiated successfully", data: withdrawal });
    } catch (error) {
        const definitive = error.response && error.response.status >= 400 && error.response.status < 500;
        if (definitive) { await payoutRepository.restoreFailed("rider", reference, error.response?.data?.message || "Paystack rejected transfer"); return res.status(502).json({ success: false, message: "Transfer initiation failed. Your balance has been restored." }); }
        await payoutRepository.markProcessing("rider", reference, { uncertain: true });
        return res.status(202).json({ success: true, message: "Transfer status is uncertain. Funds remain reserved while Paystack reconciliation runs.", data: { reference, status: "processing" } });
    }
};

/**
 * ─── STEP 3: Initiate withdrawal ─────────────────────────────────────────────
 * Debits rider wallet and initiates Paystack transfer.
 * Rolls back wallet debit if Paystack call fails.
 *
 * POST /riders/:riderId/payout/withdraw
 * Body: { amount }
 */
export const initiateRiderWithdrawal = async (req, res) => {
    try {
        const { riderId } = req.params;

        if (req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        // STEP 1 — Validate amount
        const amount = Number(req.body.amount);
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: "Invalid withdrawal amount" });
        }
        if (amount > 500000) {
            return res.status(400).json({ success: false, message: "Maximum withdrawal amount is ₦500,000" });
        }

        if (usePostgresPayoutWrites()) return initiatePostgresRiderWithdrawal(req, res, amount);

        // STEP 2 — Fetch rider with payout details
        const rider = await Rider.findById(riderId).select("+payoutDetails.recipientCode");
        if (!rider) {
            return res.status(404).json({ success: false, message: "Rider not found" });
        }
        if (!rider.payoutDetails?.payoutEnabled) {
            return res.status(400).json({
                success: false,
                message: "No verified bank account on file. Please add a bank account before withdrawing."
            });
        }
        if (!rider.payoutDetails?.recipientCode) {
            return res.status(400).json({
                success: false,
                message: "Bank account setup incomplete. Please re-save your bank account."
            });
        }

        // STEP 3 — Fetch rider wallet
        let wallet = await Wallet.findOne({ ownerId: riderId, ownerModel: "Rider" });
        if (!wallet) {
            wallet = await Wallet.create({
                ownerId: riderId,
                ownerModel: "Rider",
                balance: 0,
                transactions: []
            });
        }
        if (wallet.balance < amount) {
            return res.status(400).json({
                success: false,
                message: `Insufficient balance. Available: ₦${wallet.balance.toLocaleString()}`
            });
        }

        // STEP 3B — Resolve effective fee-bearer/markup for this rider (defaults to
        // platform-absorbs-everything unless an ACTIVE override exists — see
        // getEffectiveFeeConfig, which only honors overrides that have cleared
        // manual notice confirmation).
        const platformConfig = await getPlatformConfig();
        const effectiveConfig = getEffectiveFeeConfig("rider", rider, platformConfig);
        const payoutCalc = computeActorPayout("rider", amount, effectiveConfig);
        const transferFee = payoutCalc.feeChargedToActor;
        const markupCharged = payoutCalc.markupChargedToActor;
        const netAmount = payoutCalc.net;

        if (netAmount <= 0) {
            return res.status(400).json({ success: false, message: "Withdrawal amount too small after fees" });
        }

        // Confirm the platform's actual Paystack balance can cover this
        // transfer BEFORE touching the rider's wallet or creating any withdrawal
        // record. Paystack settles T+1, so the live Paystack balance can lag
        // behind what riders' wallets show on any given day.
        try {
            const { sufficient } = await checkPaystackBalance(netAmount * 100);
            if (!sufficient) {
                const { message } = getNextPayoutWindowMessage();
                return res.status(400).json({
                    success: false,
                    code: "PAYSTACK_BALANCE_PENDING_SETTLEMENT",
                    message,
                });
            }
        } catch (balanceCheckErr) {
            console.error("❌ Paystack balance check failed during manual rider withdrawal:", balanceCheckErr.message);
            return res.status(503).json({
                success: false,
                message: "Could not verify payout availability right now. Please try again shortly."
            });
        }

        // STEP 4 — Block duplicate in-progress withdrawals
        const existingPending = await RiderWithdrawal.findOne({
            riderId,
            status: { $in: ["pending", "processing"] }
        });
        if (existingPending) {
            return res.status(400).json({
                success: false,
                message: "You already have a withdrawal in progress. Please wait for it to complete."
            });
        }

        // STEP 4B — 24-hour cooldown: one successful withdrawal per 24 hours
        const lastCompleted = await RiderWithdrawal.findOne({
            riderId,
            status: "completed",
        }).sort({ settledAt: -1 });

        if (lastCompleted?.settledAt) {
            const hoursSinceLast =
                (Date.now() - new Date(lastCompleted.settledAt).getTime()) / (1000 * 60 * 60);
            if (hoursSinceLast < 24) {
                const hoursRemaining = Math.ceil(24 - hoursSinceLast);
                return res.status(429).json({
                    success: false,
                    message: `Withdrawal cooldown active. You can withdraw again in ${hoursRemaining} hour${hoursRemaining !== 1 ? "s" : ""}.`,
                });
            }
        }

        // STEP 5 — Generate idempotency reference
        const paystackReference = `RWD_${randomUUID().replace(/-/g, "").toUpperCase()}`;

        // STEP 6 — Create withdrawal document
        const withdrawal = await RiderWithdrawal.create({
            riderId,
            walletId: wallet._id,
            requestedAmount: amount,
            transferFee,
            netAmount,
            status: "pending",
            paystackReference,
            recipientCode: rider.payoutDetails.recipientCode,
            bankName: rider.payoutDetails.bankName,
            accountNumber: rider.payoutDetails.accountNumber,
            accountName: rider.payoutDetails.accountName,
            activePayoutKey: `rider:${riderId}`,
            // Record what was actually applied, for audit trail — markup is tracked
            // separately from transferFee since it's platform revenue, not a
            // pass-through Paystack cost.
            appliedMarkup: markupCharged,
        });

        // STEP 8 — Debit wallet immediately
        wallet.balance = Number((wallet.balance - amount).toFixed(2));
        wallet.totalWithdrawn = Number((wallet.totalWithdrawn + amount).toFixed(2));
        wallet.transactions.push({
            type: "debit",
            amount,
            description: `Withdrawal initiated — Ref: ${paystackReference}`,
            transactionType: "withdrawal",
        });
        await wallet.save();
        withdrawal.walletDebitedAt = new Date();
        await withdrawal.save();

        // STEP 9 — Call Paystack Transfer API
        try {
            const paystackResponse = await axios.post(
                "https://api.paystack.co/transfer",
                {
                    source: "balance",
                    amount: netAmount * 100, // convert to kobo
                    recipient: rider.payoutDetails.recipientCode,
                    reference: paystackReference,
                    reason: `MelaChow rider payout — ${rider.name}`,
                    metadata: {
                        platform: "melachow",
                    },
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                        "Content-Type": "application/json",
                    }
                }
            );

            const transferCode = paystackResponse.data?.data?.transfer_code;

            withdrawal.status = "processing";
            withdrawal.paystackTransferCode = transferCode || null;
            await withdrawal.save();

            return res.status(200).json({
                success: true,
                message: "Withdrawal initiated successfully",
                data: {
                    reference: paystackReference,
                    requestedAmount: amount,
                    transferFee,
                    netAmount,
                    status: "processing",
                    bankName: rider.payoutDetails.bankName,
                    accountNumber: rider.payoutDetails.accountNumber,
                }
            });

        } catch (paystackErr) {
            const uncertainOutcome = !paystackErr.response || paystackErr.response.status >= 500;
            if (uncertainOutcome) {
                withdrawal.status = "processing";
                withdrawal.reconciliationStatus = "manual_review";
                withdrawal.failureReason = "Transfer submission outcome is unknown; funds remain reserved pending reconciliation";
                await withdrawal.save();
                return res.status(202).json({
                    success: true,
                    message: "Transfer status is uncertain. Funds remain reserved while Paystack reconciliation runs.",
                    data: { reference: paystackReference, status: "processing" },
                });
            }
            // Rollback wallet debit
            wallet.balance = Number((wallet.balance + amount).toFixed(2));
            wallet.totalWithdrawn = Number((wallet.totalWithdrawn - amount).toFixed(2));
            // Remove only the specific withdrawal debit — never use pop() which removes the wrong
            // transaction if any concurrent credit landed between the debit save and this rollback
            wallet.transactions = wallet.transactions.filter(
                t => !t.description?.includes(paystackReference)
            );
            await wallet.save();

            withdrawal.status = "failed";
            withdrawal.activePayoutKey = undefined;
            withdrawal.failureReason = paystackErr.response?.data?.message || "Paystack API error";
            await withdrawal.save();

            console.error("❌ Paystack Rider Transfer Error:", paystackErr.response?.data || paystackErr.message);
            return res.status(502).json({
                success: false,
                message: "Transfer initiation failed. Your balance has been restored.",
                error: paystackErr.response?.data?.message || "Paystack API error"
            });
        }

    } catch (err) {
        console.error("❌ initiateRiderWithdrawal critical error:", err.message);
        return res.status(500).json({
            success: false,
            message: "Internal server error during withdrawal initiation"
        });
    }
};

/**
 * ─── Withdrawal history ───────────────────────────────────────────────────────
 * GET /riders/:riderId/payout/history
 */
export const getRiderWithdrawalHistory = async (req, res) => {
    try {
        const { riderId } = req.params;

        if (req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        if (usePostgresWalletReads()) {
            const response = await walletRepository.getRiderWithdrawalHistory(riderId);
            return res.status(200).json(response);
        }

        const withdrawals = await RiderWithdrawal.find({ riderId })
            .sort({ createdAt: -1 })
            .limit(50)
            .select("-recipientCode");

        return res.status(200).json({ success: true, data: withdrawals });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch withdrawal history"
        });
    }
};

/**
 * ─── Bank account info ────────────────────────────────────────────────────────
 * GET /riders/:riderId/payout/bank-account
 */
export const getRiderBankAccount = async (req, res) => {
    try {
        const { riderId } = req.params;

        if (req.rider._id.toString() !== riderId) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        if (usePostgresWalletReads()) {
            const response = await walletRepository.getRiderBankAccount(riderId);
            if (response.status) {
                return res.status(response.status).json({ success: false, message: response.message });
            }
            return res.status(200).json(response);
        }

        const rider = await Rider.findById(riderId).select("payoutDetails");
        if (!rider) {
            return res.status(404).json({ success: false, message: "Rider not found" });
        }

        const { bankName, accountNumber, accountName, payoutEnabled } = rider.payoutDetails || {};

        return res.status(200).json({
            success: true,
            data: { bankName, accountNumber, accountName, payoutEnabled: !!payoutEnabled }
        });

    } catch (err) {
        return res.status(500).json({ success: false, message: "Failed to fetch bank account" });
    }
};
