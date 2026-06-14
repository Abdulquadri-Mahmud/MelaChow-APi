import axios from "axios";
import { randomUUID } from "crypto";
import Vendor from "../../model/vendor/vendor.model.js";
import Wallet from "../../model/wallet/wallet.mode.js";
import Withdrawal from "../../model/wallet/Withdrawal.model.js";
import { usePostgresWalletReads } from "../../services/postgres/compat.js";
import { walletRepository } from "../../services/postgres/wallet.repository.js";

/**
 * ─── FUNCTION 1: initiateWithdrawal ───
 */
export const initiateWithdrawal = async (req, res) => {
  try {
    // STEP 1 — Parse and validate amount
    const amount = Number(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid withdrawal amount" });
    }
    if (amount < 1500) {
      return res.status(400).json({ message: "Minimum withdrawal amount is ₦1,500" });
    }
    if (amount > 1000000) {
      return res.status(400).json({ message: "Maximum withdrawal amount is ₦1,000,000" });
    }

    // STEP 2 — Fetch vendor with payout details
    const vendor = await Vendor.findById(req.vendor._id).select("+payoutDetails");
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }
    if (!vendor.payoutDetails?.payoutEnabled) {
      return res.status(400).json({
        message: "No verified bank account on file. Please add a bank account before withdrawing.",
      });
    }
    if (!vendor.payoutDetails?.recipientCode) {
      return res.status(400).json({
        message: "Bank account setup incomplete. Please re-save your bank account.",
      });
    }

    // STEP 3 — Fetch vendor wallet
    const wallet = await Wallet.findOne({ ownerId: req.vendor._id, ownerModel: "Vendor" });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }
    if (wallet.balance < amount) {
      return res.status(400).json({
        message: `Insufficient balance. Available: ₦${wallet.balance.toLocaleString()}`,
      });
    }

    // STEP 4 — Check for pending/processing withdrawal (prevent duplicate)
    const existingPending = await Withdrawal.findOne({
      vendorId: req.vendor._id,
      status: { $in: ["pending", "processing"] },
    });
    if (existingPending) {
      return res.status(400).json({
        message: "You already have a withdrawal in progress. Please wait for it to complete.",
      });
    }

    // STEP 4B — 24-hour cooldown: one successful withdrawal per 24 hours
    const lastCompleted = await Withdrawal.findOne({
      vendorId: req.vendor._id,
      status: "completed",
    }).sort({ settledAt: -1 });

    if (lastCompleted?.settledAt) {
      const hoursSinceLast =
        (Date.now() - new Date(lastCompleted.settledAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLast < 24) {
        const hoursRemaining = Math.ceil(24 - hoursSinceLast);
        return res.status(429).json({
          message: `Withdrawal cooldown active. You can withdraw again in ${hoursRemaining} hour${hoursRemaining !== 1 ? "s" : ""}.`,
        });
      }
    }

    // STEP 5 — Calculate Paystack transfer fee
    let transferFee = 50;
    if (amount <= 5000) transferFee = 10;
    else if (amount <= 50000) transferFee = 25;

    const netAmount = amount - transferFee;
    if (netAmount <= 0) {
      return res.status(400).json({ message: "Withdrawal amount too small after fees" });
    }

    // STEP 6 — Generate idempotency reference
    const paystackReference = `WD_${randomUUID().replace(/-/g, "").toUpperCase()}`;

    // STEP 7 — Create Withdrawal document with status "pending"
    const withdrawal = await Withdrawal.create({
      vendorId: req.vendor._id,
      walletId: wallet._id,
      requestedAmount: amount,
      transferFee,
      netAmount,
      status: "pending",
      paystackReference,
      recipientCode: vendor.payoutDetails.recipientCode,
      bankName: vendor.payoutDetails.bankName,
      accountNumber: vendor.payoutDetails.accountNumber,
      accountName: vendor.payoutDetails.accountName,
    });

    // STEP 8 — Debit wallet balance immediately
    wallet.balance = Number((wallet.balance - amount).toFixed(2));
    wallet.totalWithdrawn = Number((wallet.totalWithdrawn + amount).toFixed(2));
    wallet.transactions.push({
      type: "debit",
      amount: amount,
      description: `Withdrawal initiated — Ref: ${paystackReference}`,
      transactionType: "withdrawal",
    });
    await wallet.save();

    // STEP 9 — Call Paystack Transfer API
    try {
      const paystackResponse = await axios.post(
        "https://api.paystack.co/transfer",
        {
          source: "balance",
          amount: netAmount * 100, // Convert to kobo
          recipient: vendor.payoutDetails.recipientCode,
          reference: paystackReference,
          reason: `MelaChow vendor payout — ${vendor.storeName}`,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const transferCode = paystackResponse.data?.data?.transfer_code;

      // Update withdrawal to processing
      withdrawal.status = "processing";
      withdrawal.paystackTransferCode = transferCode || null;
      await withdrawal.save();

      return res.json({
        message: "Withdrawal initiated successfully",
        withdrawal: {
          reference: paystackReference,
          requestedAmount: amount,
          transferFee,
          netAmount,
          status: "processing",
          bankName: vendor.payoutDetails.bankName,
          accountNumber: vendor.payoutDetails.accountNumber,
        },
      });
    } catch (paystackError) {
      // ROLLBACK: reverse wallet debit
      wallet.balance = Number((wallet.balance + amount).toFixed(2));
      wallet.totalWithdrawn = Number((wallet.totalWithdrawn - amount).toFixed(2));
      // Remove only the specific withdrawal debit — never use pop() which removes the wrong
      // transaction if any concurrent credit landed between the debit save and this rollback
      wallet.transactions = wallet.transactions.filter(
          t => !t.description?.includes(paystackReference)
      );
      await wallet.save();

      // Mark withdrawal as failed
      withdrawal.status = "failed";
      withdrawal.failureReason = paystackError.response?.data?.message || "Paystack API error";
      await withdrawal.save();

      console.error("Paystack Transfer Error:", paystackError.response?.data || paystackError.message);
      return res.status(502).json({
        message: "Transfer initiation failed. Your balance has been restored.",
        error: paystackError.response?.data?.message || "Paystack API error",
      });
    }
  } catch (err) {
    console.error("Critical Withdrawal Error:", err);
    return res.status(500).json({ message: "Internal server error during withdrawal initiation" });
  }
};

/**
 * ─── FUNCTION 2: getWithdrawalHistory ───
 */
export const getWithdrawalHistory = async (req, res) => {
  try {
    if (usePostgresWalletReads()) {
      const response = await walletRepository.getVendorWithdrawalHistory(req.vendor._id);
      return res.json(response);
    }

    const withdrawals = await Withdrawal.find({ vendorId: req.vendor._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("-recipientCode"); // Never expose recipientCode

    return res.json({ withdrawals });
  } catch (error) {
    console.error("Get Withdrawal History Error:", error);
    return res.status(500).json({ message: "Failed to fetch withdrawal history", error: error.message, stack: error.stack });
  }
};

// PATCH /api/admin/withdrawals/:withdrawalId/force-fail
export const forceFailWithdrawal = async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findById(req.params.withdrawalId);
    if (!withdrawal) return res.status(404).json({ message: "Withdrawal not found" });
    if (!["pending", "processing"].includes(withdrawal.status)) {
      return res.status(400).json({ message: `Cannot force-fail a withdrawal with status: ${withdrawal.status}` });
    }

    const wallet = await Wallet.findById(withdrawal.walletId);
    if (wallet) {
      wallet.balance = Number((wallet.balance + withdrawal.requestedAmount).toFixed(2));
      wallet.totalWithdrawn = Number((wallet.totalWithdrawn - withdrawal.requestedAmount).toFixed(2));
      wallet.transactions.push({
        type: "credit",
        amount: withdrawal.requestedAmount,
        description: `Admin override: withdrawal ${withdrawal.paystackReference} force-failed. Funds restored.`,
        transactionType: 'refund',
      });
      await wallet.save();
    }

    withdrawal.status = "failed";
    withdrawal.failureReason = "Admin override — stuck withdrawal";
    await withdrawal.save();

    return res.json({ message: "Withdrawal force-failed and balance restored", withdrawal });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
