import Wallet from "../../model/wallet/wallet.mode.js";
import axios from "axios";
import crypto from "crypto";

// =======================
// GET USER WALLET
// =======================
export const getUserWallet = async (req, res) => {
    try {
        const userId = req.userId;

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
                callback_url: process.env.CALL_BACK_URL,
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

        // 1. Verify with Paystack
        const verifyResp = await axios.get(
            `https://api.paystack.co/transaction/verify/${reference}`,
            {
                headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
            }
        );

        const data = verifyResp.data?.data;

        if (!data || data.status !== "success") {
            return res.status(400).json({ success: false, message: "Payment failed or invalid" });
        }

        // 2. Amount actually paid
        const amountPaid = data.amount / 100; // Convert back to Naira

        // 3. Find Wallet
        let wallet = await Wallet.findOne({ ownerId: userId, ownerModel: "User" });
        if (!wallet) {
            wallet = await Wallet.create({ ownerId: userId, ownerModel: "User" });
        }

        // 4. Idempotency Check (Check if transaction already exists)
        // We scan transactions for this reference in description or metadata?
        // Current Schema stores 'description'. Let's put ref in description.
        const description = `Wallet funding via ${reference}`;

        const existingTx = wallet.transactions.find(t => t.description === description);
        if (existingTx) {
            return res.status(200).json({ success: true, message: "Wallet already credited", wallet });
        }

        // 5. Credit Wallet
        wallet.balance += amountPaid;
        wallet.transactions.push({
            type: "credit",
            amount: amountPaid,
            description: description,
            date: new Date()
        });

        await wallet.save();

        return res.status(200).json({
            success: true,
            message: "Wallet funded successfully",
            wallet
        });

    } catch (error) {
        console.error("Verify Funding Error:", error.message);
        return res.status(500).json({ success: false, message: "Verification failed" });
    }
};

// =======================
// ADMIN REFUND / CREDIT USER
// =======================
export const creditUserWallet = async (req, res) => {
    try {
        const { userId, amount, reason } = req.body;

        if (!userId || !amount || !reason) {
            return res.status(400).json({ message: "userId, amount, and reason are required" });
        }

        let wallet = await Wallet.findOne({ ownerId: userId, ownerModel: "User" });
        if (!wallet) {
            wallet = await Wallet.create({ ownerId: userId, ownerModel: "User" });
        }

        wallet.balance += Number(amount);
        wallet.transactions.push({
            type: "credit", // Refund is a credit
            amount: Number(amount),
            description: `Refund/Adjustment: ${reason}`,
            date: new Date()
        });

        await wallet.save();

        return res.status(200).json({
            success: true,
            message: "User wallet credited successfully",
            wallet
        });

    } catch (error) {
        console.error("Admin Refund Error:", error);
        return res.status(500).json({ success: false, message: "Error crediting wallet" });
    }
};
