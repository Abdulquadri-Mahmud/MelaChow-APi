import axios from "axios";
import Vendor from "../../model/vendor/vendor.model.js";

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
    const response = await axios.get(`${PAYSTACK_BASE_URL}/bank?currency=NGN&per_page=100`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });

    return res.json({ banks: response.data.data });
  } catch (error) {
    const message = handlePaystackError(error, "Failed to fetch bank list");
    return res.status(502).json({ message });
  }
};

// ─── FUNCTION 2: resolveAccount ───
export const resolveAccount = async (req, res) => {
  try {
    const { account_number, bank_code } = req.query;

    if (!account_number || !bank_code) {
      return res.status(400).json({ message: "Account number and bank code are required" });
    }

    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      }
    );

    return res.json({ account_name: response.data.data.account_name });
  } catch (error) {
    const message = handlePaystackError(error, "Could not resolve account. Check the account number and bank.");
    return res.status(502).json({ message });
  }
};

// ─── FUNCTION 3: saveBankAccount ───
export const saveBankAccount = async (req, res) => {
  try {
    const { bank_name, bank_code, account_number, account_name } = req.body;

    if (!bank_name || !bank_code || !account_number || !account_name) {
      return res.status(400).json({ message: "All fields are required: bank_name, bank_code, account_number, account_name" });
    }

    const vendor = await Vendor.findById(req.vendor._id).select("+payoutDetails");
    if (!vendor) {
      return res.status(404).json({ message: "Vendor not found" });
    }

    // Delete old recipient if exists
    if (vendor.payoutDetails && vendor.payoutDetails.recipientCode) {
      try {
        await axios.delete(`${PAYSTACK_BASE_URL}/transferrecipient/${vendor.payoutDetails.recipientCode}`, {
          headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
        });
      } catch (delError) {
        console.error("Failed to delete old Paystack recipient:", delError.response?.data || delError.message);
        // Continue even if delete fails
      }
    }

    // Create new transfer recipient
    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transferrecipient`,
      {
        type: "nuban",
        name: account_name,
        account_number: account_number,
        bank_code: bank_code,
        currency: "NGN",
      },
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      }
    );

    const recipient_code = response.data.data.recipient_code;

    // Update vendor details
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
      message: "Bank account saved successfully",
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
    try {
      await axios.delete(`${PAYSTACK_BASE_URL}/transferrecipient/${vendor.payoutDetails.recipientCode}`, {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      });
    } catch (delError) {
      console.error("Failed to delete Paystack recipient:", delError.response?.data || delError.message);
      // Continue to cleanup DB regardless
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
