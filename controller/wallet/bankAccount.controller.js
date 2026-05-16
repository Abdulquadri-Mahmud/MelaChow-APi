import axios from "axios";
import Vendor from "../../model/vendor/vendor.model.js";
import { fetchBankList, resolveBankAccount as resolveAccountService, createTransferRecipient, deleteTransferRecipient } from "../../services/bank.service.js";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

/**
 * Handle Paystack API errors safely
 */
const handlePaystackError = (error, defaultMessage) => {
  console.error("Paystack API Error:", error.response?.data || error.message);
  return defaultMessage;
};

// ─── FUNCTION 1: getBankList ───
export const getBankList = async (req, res) => {
  try {
    const banks = await fetchBankList();
    return res.json({ success: true, banks, data: banks });
  } catch (error) {
    const message = handlePaystackError(error, "Failed to fetch bank list");
    return res.status(502).json({ message });
  }
};

// ─── FUNCTION 2: resolveAccount ───
export const resolveAccount = async (req, res) => {
  try {
    const account_number = req.query.account_number || req.query.accountNumber;
    const bank_code = req.query.bank_code || req.query.bankCode;

    if (!account_number || !bank_code) {
      return res.status(400).json({ message: "Account number and bank code are required" });
    }

    const account_name = await resolveAccountService(account_number, bank_code);

    return res.json({
      success: true,
      account_name,
      data: {
        accountName: account_name,
        accountNumber: account_number,
        bankCode: bank_code,
      },
    });
  } catch (error) {
    const message = handlePaystackError(error, "Could not resolve account. Check the account number and bank.");
    return res.status(502).json({ message });
  }
};

// ─── FUNCTION 3: saveBankAccount ───
export const saveBankAccount = async (req, res) => {
  try {
    const bank_name = req.body.bank_name || req.body.bankName;
    const bank_code = req.body.bank_code || req.body.bankCode;
    const account_number = req.body.account_number || req.body.accountNumber;
    const account_name = req.body.account_name || req.body.accountName;

    if (!bank_name || !bank_code || !account_number || !account_name) {
      return res.status(400).json({ message: "All fields are required: bank_name, bank_code, account_number, account_name" });
    }

    const vendor = await Vendor.findById(req.vendor._id).select("+payoutDetails");
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // 🔒 SECURITY: Prevent self-service updates to registered bank details.
    // Once a bank account is registered and payout is enabled, changes must go
    // through the platform admin to prevent fraudulent account substitution.
    if (vendor.payoutDetails && vendor.payoutDetails.payoutEnabled && vendor.payoutDetails.accountNumber) {
      return res.status(403).json({
        message: "Bank account details are already registered and cannot be changed self-service. Please contact MelaChow support to update your payout account.",
        code: "BANK_DETAILS_LOCKED"
      });
    }

    // Create new transfer recipient (first-time registration only)
    const recipient_code = await createTransferRecipient({
      name: account_name,
      account_number: account_number,
      bank_code: bank_code
    });

    // Register payout details for the first time
    vendor.payoutDetails = {
      bankName: bank_name,
      bankCode: bank_code,
      accountName: account_name,
      accountNumber: account_number,
      recipientCode: recipient_code,
      payoutMethod: "paystack",
      payoutEnabled: true,
    };

    await vendor.save();

    return res.json({
      message: "Bank account registered successfully",
      bank: {
        bankName: bank_name,
        accountName: account_name,
        accountNumber: account_number,
      },
    });
  } catch (error) {
    const message = handlePaystackError(error, "Failed to register bank account with Paystack");
    return res.status(502).json({ message });
  }
};

// ─── FUNCTION 4: removeBankAccount ───
export const removeBankAccount = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor._id).select("+payoutDetails");

    if (!vendor || !vendor.payoutDetails || !vendor.payoutDetails.recipientCode) {
      return res.status(400).json({ message: "No bank account registered" });
    }

    // Delete recipient from Paystack
    if (vendor.payoutDetails.recipientCode) {
      await deleteTransferRecipient(vendor.payoutDetails.recipientCode);
    }

    // Reset payout details
    vendor.payoutDetails = {
      bankName: "",
      bankCode: "",
      accountName: "",
      accountNumber: "",
      recipientCode: "",
      payoutMethod: "paystack", // default to paystack
      payoutEnabled: false,
    };

    await vendor.save();

    return res.json({ message: "Bank account removed successfully" });
  } catch (error) {
    console.error("Remove Bank Account Error:", error);
    return res.status(500).json({ message: "Internal server error while removing bank account" });
  }
};
