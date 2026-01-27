// controllers/walletController.js
import Wallet from "../models/Wallet.js";

/**
 * Fetch Vendor Wallet
 * -------------------------------
 * Example: /api/wallet/vendor?vendor=64f7ab...
 */
export const getVendorWallet = async (req, res) => {
  try {
    const { vendor } = req.query;
    const wallet = await Wallet.findOne({
      ownerType: "vendor",
      ownerId: vendor,
    });

    if (!wallet)
      return res.status(404).json({ message: "Vendor wallet not found" });

    res.status(200).json(wallet);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

/**
 * Fetch Platform Wallet
 * -------------------------------
 * Example: /api/wallet/platform
 */
export const getPlatformWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findOne({ ownerType: "platform" });
    if (!wallet)
      return res.status(404).json({ message: "Platform wallet not found" });

    res.status(200).json(wallet);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

/**
 * WITHDRAW FUNDS
 * -----------------------------------
 * Sends vendor's money to their bank account through Paystack
 */
export const withdrawFunds = async (req, res) => {
  try {
    const { vendorId, amount, bankCode, accountNumber } = req.body;

    // ✅ Find wallet
    const wallet = await Wallet.findOne({ ownerId: vendorId });
    if (!wallet) return res.status(404).json({ message: "Wallet not found" });

    if (wallet.balance < amount)
      return res.status(400).json({ message: "Insufficient balance" });

    // ✅ Initiate transfer recipient
    const recipient = await axios.post(
      "https://api.paystack.co/transferrecipient",
      {
        type: "nuban",
        name: "Vendor Withdraw",
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "NGN",
      },
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      }
    );

    const recipientCode = recipient.data.data.recipient_code;

    // ✅ Create transfer
    const transfer = await axios.post(
      "https://api.paystack.co/transfer",
      {
        source: "balance",
        amount: amount * 100, // in kobo
        recipient: recipientCode,
        reason: "Vendor Withdrawal",
      },
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      }
    );

    // ✅ Deduct wallet balance
    wallet.balance -= amount;
    wallet.totalWithdrawn += amount;
    await wallet.save();

    res.status(200).json({
      message: "Withdrawal successful",
      transfer: transfer.data,
    });
  } catch (error) {
    console.error("Withdraw error:", error);
    res.status(500).json({ message: "Withdrawal failed", error: error.message });
  }
};