import mongoose from "mongoose";
import Wallet from "../../model/wallet/wallet.mode.js";
import PaymentAttempt from "../../model/order/PaymentAttempt.js";
import axios from "axios";
import crypto from "crypto";
import { generateWalletFundingInvoice } from "../../services/invoice.service.js";
import { usePostgresWalletReads } from "../../services/postgres/compat.js";
import { walletRepository } from "../../services/postgres/wallet.repository.js";

// =======================
// GET USER WALLET
// =======================
export const getUserWallet = async (req, res) => {
    try {
        const userId = req.userId;

        if (usePostgresWalletReads()) {
            const response = await walletRepository.getUserWallet(userId);
            return res.status(200).json(response);
        }

        let wallet = await Wallet.findOne({ ownerId: userId, ownerModel: "User" });

        if (!wallet) {
            wallet = await Wallet.create({
                ownerId: userId,
                ownerModel: "User",
                balance: 0,
                transactions: []
            });
        }

        return res.status(200).json({
            success: true,
            wallet
        });

    } catch (error) {
        console.error("Get Wallet Error:", error);
        return res.status(500).json({ success: false, message: "Error fetching wallet" });
    }
};

// =======================
// INITIATE WALLET FUNDING
// =======================
export const initiateWalletFunding = async (req, res) => {
    try {
        const userId = req.userId;
        const { amount, email } = req.body;

        if (!amount || amount < 100) { // Minimum 100 naira
            return res.status(400).json({ message: "Amount must be at least 100" });
        }

        const reference = `W_FUND_${userId}_${Date.now()}`;

        // Initialize Paystack
        const response = await axios.post(
            "https://api.paystack.co/transaction/initialize",
            {
                email: email || req.user?.email, // Fallback to authenticated user email
                amount: Math.round(amount * 100), // Kobo
                reference,
                callback_url: process.env.FUND_WALLET_CALL_BACK_URL,
                metadata: {
                    userId,
                    type: "wallet_funding"
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                    "Content-Type": "application/json",
                },
                    timeout: 15000,
            }
        );

        return res.status(200).json({
            success: true,
            authorization_url: response.data.data.authorization_url,
            reference,
            message: "Payment initialized"
        });

    } catch (error) {
        console.error("Fund Wallet Error:", error.response?.data || error.message);
        return res.status(500).json({ success: false, message: "Error initializing payment" });
    }
};

// =======================
// VERIFY WALLET FUNDING
// =======================
export const verifyWalletFunding = async (req, res) => {
    try {
        const { reference } = req.params;
        const userId = req.userId;

        if (!reference || !/^[A-Za-z0-9_-]{6,128}$/.test(String(reference))) {
            return res.status(400).json({ success: false, message: "Valid payment reference is required" });
        }

        // 1. Verify with Paystack
        const verifyResp = await axios.get(
            `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
            {
                headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
                timeout: 15000,
            }
        );

        const data = verifyResp.data?.data;

        if (!data || data.status !== "success") {
            return res.status(400).json({ success: false, message: "Payment failed or invalid" });
        }

        // 2. Enforce wallet-funding purpose, owner, currency, and reference match
        if (data.reference && String(data.reference) !== String(reference)) {
            return res.status(409).json({ success: false, message: "Payment reference mismatch" });
        }
        if (String(data.currency || "").toUpperCase() !== "NGN") {
            return res.status(409).json({ success: false, message: "Invalid payment currency" });
        }
        if (data.metadata?.type !== "wallet_funding") {
            return res.status(403).json({ success: false, message: "This payment reference is not a wallet funding transaction" });
        }
        const metaUserId = String(data.metadata?.userId || "");
        const callerIds = new Set([String(userId), req.postgresUserId ? String(req.postgresUserId) : null].filter(Boolean));
        if (!metaUserId || !callerIds.has(metaUserId)) {
            return res.status(403).json({ success: false, message: "This payment reference does not belong to your account" });
        }

        const amountKobo = Math.round(Number(data.amount || 0));
        if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
            return res.status(400).json({ success: false, message: "Invalid payment amount" });
        }
        const amountPaid = Number((amountKobo / 100).toFixed(2));

        // 3. PostgreSQL path (atomic + globally unique PaymentAttempt.reference)
        if (usePostgresWalletReads()) {
            const pgResult = await walletRepository.fundUserWalletFromPaystack({
                userId,
                reference,
                amountKobo,
                providerPayload: { reference: data.reference, status: data.status, amount: amountKobo, currency: data.currency, paid_at: data.paid_at },
            });
            const invoice = await generateWalletFundingInvoice({ userId, amount: amountPaid, reference }).catch(() => null);
            return res.status(200).json({
                success: true,
                message: pgResult.alreadyCredited ? "Wallet already credited" : "Wallet funded successfully",
                wallet: pgResult.wallet,
                invoice,
            });
        }

        // 4. MongoDB path: globally unique PaymentAttempt + atomic $inc inside transaction
        const description = `Wallet funding via ${reference}`;
        const session = await mongoose.startSession();
        let wallet;
        let alreadyCredited = false;
        try {
            await session.withTransaction(async () => {
                try {
                    await PaymentAttempt.create([{
                        reference,
                        provider: "paystack",
                        userId,
                        status: "success",
                        expectedAmount: amountPaid,
                        expectedAmountKobo: amountKobo,
                        paidAmount: amountPaid,
                        paidAmountKobo: amountKobo,
                        currency: "NGN",
                        providerStatus: "success",
                        recoveryState: "recovered",
                        events: [{ type: "wallet_funding_verified", message: description, metadata: { type: "wallet_funding" }, at: new Date() }],
                    }], { session });
                } catch (dupErr) {
                    if (dupErr?.code === 11000) {
                        alreadyCredited = true;
                        return;
                    }
                    throw dupErr;
                }

                wallet = await Wallet.findOneAndUpdate(
                    { ownerId: userId, ownerModel: "User" },
                    {
                        $inc: { balance: amountPaid },
                        $push: {
                            transactions: {
                                type: "credit",
                                amount: amountPaid,
                                transactionType: "top_up",
                                description,
                                date: new Date(),
                            },
                        },
                    },
                    { upsert: true, new: true, session }
                );
            });
        } finally {
            await session.endSession();
        }

        if (alreadyCredited) {
            const existingAttempt = await PaymentAttempt.findOne({ reference }).select("userId").lean();
            if (existingAttempt?.userId && String(existingAttempt.userId) !== String(userId)) {
                return res.status(409).json({ success: false, message: "This payment reference has already been used." });
            }
            wallet = await Wallet.findOne({ ownerId: userId, ownerModel: "User" });
        }

        const invoice = await generateWalletFundingInvoice({ userId, amount: amountPaid, reference }).catch(() => null);

        return res.status(200).json({
            success: true,
            message: alreadyCredited ? "Wallet already credited" : "Wallet funded successfully",
            wallet,
            invoice
        });

    } catch (error) {
        console.error("Verify Funding Error:", error.message);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : "Verification failed" });
    }
};

// =======================
// ADMIN REFUND / CREDIT USER
// =======================
export const creditUserWallet = async (req, res) => {
    try {
        const { userId, amount, reason } = req.body;
        const creditAmount = Number(amount);

        if (!userId || !reason || !Number.isFinite(creditAmount) || creditAmount <= 0) {
            return res.status(400).json({ message: "userId, reason, and a positive numeric amount are required" });
        }

        if (usePostgresWalletReads()) {
            const wallet = await walletRepository.creditUserWalletAdmin({ userId, amountNaira: creditAmount, reason });
            return res.status(200).json({
                success: true,
                message: "User wallet credited successfully",
                wallet,
            });
        }

        const wallet = await Wallet.findOneAndUpdate(
            { ownerId: userId, ownerModel: "User" },
            {
                $inc: { balance: Number(creditAmount.toFixed(2)) },
                $push: {
                    transactions: {
                        type: "credit",
                        amount: Number(creditAmount.toFixed(2)),
                        transactionType: "manual_credit",
                        description: `Refund/Adjustment: ${reason}`,
                        date: new Date(),
                    },
                },
            },
            { upsert: true, new: true }
        );

        return res.status(200).json({
            success: true,
            message: "User wallet credited successfully",
            wallet
        });

    } catch (error) {
        console.error("Admin Refund Error:", error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : "Error crediting wallet" });
    }
};
