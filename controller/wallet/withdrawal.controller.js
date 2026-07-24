import axios from "axios";
import { randomUUID } from "crypto";
import Vendor from "../../model/vendor/vendor.model.js";
import Wallet from "../../model/wallet/wallet.mode.js";
import Withdrawal from "../../model/wallet/Withdrawal.model.js";
import RiderWithdrawal from "../../model/wallet/RiderWithdrawal.model.js";
import { usePostgresWalletReads } from "../../services/postgres/compat.js";
import { walletRepository } from "../../services/postgres/wallet.repository.js";
import { calculatePaystackTransferFee } from "../../utils/paystackFees.js";
import { initiatePaystackTransfer } from "../../services/paystackTransfer.service.js";
import { applyTransferOutcome, findWithdrawal, reconcileWithdrawal } from "../../services/transferReconciliation.service.js";

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
    const transferFee = calculatePaystackTransferFee(amount);

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
      activePayoutKey: `vendor:${req.vendor._id}`,
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
    withdrawal.walletDebitedAt = new Date();
    await withdrawal.save();

    // STEP 9 — Call Paystack Transfer API

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
          metadata: {
            platform: "melachow",
          },
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
      const uncertainOutcome = !paystackError.response || paystackError.response.status >= 500;
      if (uncertainOutcome) {
        withdrawal.status = "processing";
        withdrawal.reconciliationStatus = "manual_review";
        withdrawal.failureReason = "Transfer submission outcome is unknown; funds remain reserved pending reconciliation";
        await withdrawal.save();
        return res.status(202).json({
          message: "Transfer status is uncertain. Funds remain reserved while Paystack reconciliation runs.",
          reference: paystackReference,
        });
      }
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
      withdrawal.activePayoutKey = undefined;
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

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// PATCH /api/admin/withdrawals/:withdrawalId/force-fail
const legacyForceFailWithdrawal = async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    let withdrawal = await Withdrawal.findById(withdrawalId);
    let type = "vendor";
    if (!withdrawal) {
      withdrawal = await RiderWithdrawal.findById(withdrawalId);
      type = "rider";
    }

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
        transactionType: "refund",
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

// GET /api/admin/finance/withdrawals
export const getAdminWithdrawals = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 50, 1);
    const skip = (page - 1) * limit;
    const { status, type, search, startDate, endDate } = req.query;

    const baseFilter = {};

    // Date range filter
    if (startDate || endDate) {
      baseFilter.createdAt = {};
      if (startDate) baseFilter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) {
          end.setHours(23, 59, 59, 999);
          baseFilter.createdAt.$lte = end;
        }
      }
    }

    // Status filter
    if (status && status !== "all") {
      baseFilter.status = status;
    }

    // Search filter
    if (search && search.trim() !== "") {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      baseFilter.$or = [
        { accountName: regex },
        { accountNumber: regex },
        { bankName: regex },
        { paystackReference: regex },
        { failureReason: regex },
      ];
    }

    let fetchVendors = true;
    let fetchRiders = true;

    if (type === "vendor") {
      fetchRiders = false;
    } else if (type === "rider") {
      fetchVendors = false;
    }

    const queries = [];
    const maxItems = page * limit;

    if (fetchVendors) {
      queries.push(
        Withdrawal.find(baseFilter)
          .sort({ createdAt: -1 })
          .limit(maxItems)
          .populate("vendorId", "storeName email phone")
          .lean()
          .then(rows => rows.map(r => ({
            ...r,
            withdrawalType: "vendor",
            recipientName: r.vendorId?.storeName || r.accountName || "Unknown Merchant",
            recipientPhone: r.vendorId?.phone || "",
            recipientEmail: r.vendorId?.email || "",
          })))
      );
    }
    if (fetchRiders) {
      queries.push(
        RiderWithdrawal.find(baseFilter)
          .sort({ createdAt: -1 })
          .limit(maxItems)
          .populate("riderId", "name email phone")
          .lean()
          .then(rows => rows.map(r => ({
            ...r,
            withdrawalType: "rider",
            recipientName: r.riderId?.name || r.accountName || "Unknown Rider",
            recipientPhone: r.riderId?.phone || "",
            recipientEmail: r.riderId?.email || "",
          })))
      );
    }

    const results = await Promise.all(queries);
    const combined = results.flat().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Get total counts
    const countQueries = [];
    if (fetchVendors) countQueries.push(Withdrawal.countDocuments(baseFilter));
    if (fetchRiders) countQueries.push(RiderWithdrawal.countDocuments(baseFilter));
    const counts = await Promise.all(countQueries);
    const total = counts.reduce((acc, count) => acc + count, 0);

    const paginated = combined.slice(skip, skip + limit);

    return res.json({
      success: true,
      withdrawals: paginated,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (err) {
    console.error("getAdminWithdrawals error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/admin/finance/withdrawals/:id/approve
export const approvePendingWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;

    // Check Withdrawal
    let withdrawal = await Withdrawal.findById(id);
    let type = "vendor";
    if (!withdrawal) {
      withdrawal = await RiderWithdrawal.findById(id);
      type = "rider";
    }

    if (!withdrawal) {
      return res.status(404).json({ success: false, message: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Only pending withdrawals can be approved. Current status: ${withdrawal.status}`,
      });
    }

    if (!withdrawal.walletDebitedAt) {
      const sourceWallet = await Wallet.findById(withdrawal.walletId).select("transactions").lean();
      const hasMatchingDebit = sourceWallet?.transactions?.some((entry) =>
        entry.type === "debit" && entry.description?.includes(withdrawal.paystackReference)
      );
      if (!hasMatchingDebit) {
        return res.status(409).json({
          success: false,
          message: "Approval blocked: no matching wallet debit exists for this withdrawal.",
        });
      }
      withdrawal.walletDebitedAt = new Date();
      await withdrawal.save();
    }

    const ApprovalModel = type === "vendor" ? Withdrawal : RiderWithdrawal;
    withdrawal = await ApprovalModel.findOneAndUpdate(
      { _id: withdrawal._id, status: "pending" },
      { $set: { status: "processing" } },
      { new: true }
    );
    if (!withdrawal) {
      return res.status(409).json({ success: false, message: "Withdrawal is already being processed." });
    }

    // Call Paystack Transfer API
    try {
      const paystackResponse = await axios.post(
        "https://api.paystack.co/transfer",
        {
          source: "balance",
          amount: withdrawal.netAmount * 100, // Convert to kobo
          recipient: withdrawal.recipientCode,
          reference: withdrawal.paystackReference,
          reason: `MelaChow ${type} payout approved — ${withdrawal.accountName}`,
          metadata: {
            platform: "melachow",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const transferCode = paystackResponse.data?.data?.transfer_code;

      withdrawal.status = "processing";
      withdrawal.paystackTransferCode = transferCode || null;
      await withdrawal.save();

      return res.json({
        success: true,
        message: "Withdrawal approved and sent to Paystack",
        withdrawal,
      });
    } catch (paystackError) {
      const uncertainOutcome = !paystackError.response || paystackError.response.status >= 500;
      if (uncertainOutcome) {
        withdrawal.status = "processing";
        withdrawal.reconciliationStatus = "manual_review";
        withdrawal.failureReason = "Transfer submission outcome is unknown; funds remain reserved pending reconciliation";
        await withdrawal.save();
        return res.status(202).json({
          success: true,
          message: "Transfer status is uncertain. Funds remain reserved while Paystack reconciliation runs.",
          withdrawal,
        });
      }
      // ROLLBACK: reverse wallet debit
      const wallet = await Wallet.findById(withdrawal.walletId);
      if (wallet) {
        wallet.balance = Number((wallet.balance + withdrawal.requestedAmount).toFixed(2));
        wallet.totalWithdrawn = Number((wallet.totalWithdrawn - withdrawal.requestedAmount).toFixed(2));
        wallet.transactions = wallet.transactions.filter(
          t => !t.description?.includes(withdrawal.paystackReference)
        );
        await wallet.save();
      }

      // Mark withdrawal as failed
      withdrawal.status = "failed";
      withdrawal.activePayoutKey = undefined;
      withdrawal.failureReason = paystackError.response?.data?.message || "Paystack API error";
      await withdrawal.save();

      return res.status(502).json({
        success: false,
        message: `Paystack failed: ${withdrawal.failureReason}. Funds have been restored.`,
      });
    }
  } catch (err) {
    console.error("approvePendingWithdrawal error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/admin/finance/withdrawals/:id/retry
const legacyRetryWithdrawal = async (req, res) => {
        }
      );

      const transferCode = paystackResponse.data?.data?.transfer_code;
      withdrawal.paystackTransferCode = transferCode || null;
      await withdrawal.save();

      return res.json({
        success: true,
        message: "Withdrawal retried and sent to Paystack",
        withdrawal,
      });
    } catch (paystackError) {
      // ROLLBACK: reverse wallet debit
      wallet.balance = Number((wallet.balance + withdrawal.requestedAmount).toFixed(2));
      wallet.totalWithdrawn = Number((wallet.totalWithdrawn - withdrawal.requestedAmount).toFixed(2));
      wallet.transactions = wallet.transactions.filter(
        t => !t.description?.includes(newReference)
      );
      await wallet.save();

      // Mark withdrawal as failed again
      withdrawal.status = "failed";
      withdrawal.failureReason = paystackError.response?.data?.message || "Paystack API error during retry";
      await withdrawal.save();

      return res.status(502).json({
        success: false,
        message: `Paystack failed: ${withdrawal.failureReason}. Funds have been restored.`,
      });
    }
  } catch (err) {
    console.error("retryWithdrawal error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Financially safe replacement: Paystack is always the source of truth before
// funds are restored. If Paystack cannot be reached, no balance is changed.
export const forceFailWithdrawal = async (req, res) => {
  try {
    const { withdrawalId } = req.params;
    if (!(await findWithdrawal({ id: withdrawalId }))) {
      return res.status(404).json({ success: false, message: "Withdrawal not found" });
    }

    const result = await reconcileWithdrawal({ id: withdrawalId, source: "admin_force_fail_check" });
    if (!["failed", "reversed"].includes(result.withdrawal.status)) {
      return res.status(409).json({
        success: false,
        message: `Paystack reports this transfer as ${result.providerStatus}. Funds were not restored.`,
        withdrawal: result.withdrawal,
      });
    }
    return res.json({
      success: true,
      message: `Paystack confirmed the transfer ${result.withdrawal.status}; funds are restored idempotently.`,
      withdrawal: result.withdrawal,
    });
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: "Unable to verify the transfer with Paystack. No balance change was made.",
      error: error.response?.data?.message || error.message,
    });
  }
};

export const retryWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const found = await findWithdrawal({ id });
    if (!found) return res.status(404).json({ success: false, message: "Withdrawal not found" });

    const reconciled = await reconcileWithdrawal({ id, source: "admin_retry_preflight" });
    const original = reconciled.withdrawal;
    if (!["failed", "reversed"].includes(original.status) || !original.fundsRestoredAt) {
      return res.status(409).json({
        success: false,
        message: `Retry blocked. Paystack status is ${reconciled.providerStatus}; the original transfer is not safely retryable.`,
        withdrawal: original,
      });
    }

    const Model = found.Model;
    const ownerField = found.type === "vendor" ? "vendorId" : "riderId";
    const newReference = `WD_RETRY_${randomUUID().replace(/-/g, "").toUpperCase()}`;
    let retry;
    try {
      retry = await Model.create({
        [ownerField]: original[ownerField],
        walletId: original.walletId,
        requestedAmount: original.requestedAmount,
        transferFee: original.transferFee,
        netAmount: original.netAmount,
        status: "pending",
        paystackReference: newReference,
        paystackTransferCode: null,
        recipientCode: original.recipientCode,
        bankName: original.bankName,
        accountNumber: original.accountNumber,
        accountName: original.accountName,
        retryOf: original._id,
        activePayoutKey: `${found.type}:${original[ownerField]}`,
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ success: false, message: "This withdrawal already has a retry attempt." });
      }
      throw error;
    }

    const wallet = await Wallet.findOneAndUpdate(
      { _id: original.walletId, balance: { $gte: original.requestedAmount } },
      {
        $inc: { balance: -original.requestedAmount, totalWithdrawn: original.requestedAmount },
        $push: { transactions: {
          type: "debit",
          amount: original.requestedAmount,
          description: `Withdrawal retry initiated — Ref: ${newReference}`,
          transactionType: "withdrawal",
          date: new Date(),
        } },
      },
      { new: true }
    );
    if (!wallet) {
      await Model.deleteOne({ _id: retry._id, status: "pending" });
      return res.status(409).json({ success: false, message: "Insufficient wallet balance or a concurrent payout changed the balance." });
    }
    retry.walletDebitedAt = new Date();
    await retry.save();

    try {
      const provider = await initiatePaystackTransfer({
        recipientCode: retry.recipientCode,
        amountKobo: Math.round(retry.netAmount * 100),
        reference: newReference,
        reason: `MelaChow ${found.type} payout retry — ${retry.accountName}`,
      });
      retry.status = "processing";
      retry.paystackTransferCode = provider.transferCode;
      retry.providerStatus = provider.status;
      await retry.save();
      return res.json({ success: true, message: "Withdrawal retry submitted safely", withdrawal: retry });
    } catch (error) {
      const definitiveRejection = error.response && error.response.status >= 400 && error.response.status < 500;
      if (definitiveRejection) {
        await applyTransferOutcome({
          reference: newReference,
          providerData: { status: "failed", reason: error.response?.data?.message || "Paystack rejected transfer" },
          source: "initiation_rejected",
        });
      } else {
        await Model.updateOne({ _id: retry._id }, {
          $set: {
            status: "processing",
            reconciliationStatus: "manual_review",
            failureReason: "Transfer submission outcome is unknown; awaiting Paystack reconciliation",
          },
        });
      }
      return res.status(502).json({
        success: false,
        message: definitiveRejection
          ? "Paystack rejected the retry and funds were restored."
          : "Transfer status is uncertain. Funds remain reserved and the transfer will be reconciled before any retry.",
      });
    }
  } catch (error) {
    return res.status(502).json({
      success: false,
      message: "Withdrawal retry could not be completed safely.",
      error: error.response?.data?.message || error.message,
    });
  }
};

