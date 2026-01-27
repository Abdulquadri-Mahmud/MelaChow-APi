// controllers/paymentController.js (updated)
import Wallet from "../models/Wallet.js";
import Vendor from "../models/Vendor.js";
import Transaction from "../models/Transaction.js";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

export const verifyPayment = async (req, res) => {
  try {
    const { reference, user, vendor, order } = req.query;
    if (!reference)
      return res.status(400).json({ message: "Reference is required." });

    // ✅ Verify with Paystack
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
      }
    );

    const data = response.data.data;
    if (data.status !== "success")
      return res.status(400).json({ message: "Payment not successful yet" });

    // ✅ Prevent duplicate
    const exists = await Transaction.findOne({ reference });
    if (exists) return res.status(200).json({ message: "Already verified" });

    // ✅ Split payment
    const amount = data.amount / 100;
    const deliveryFee = 500;
    const platformFee = amount * 0.1;
    const vendorShare = amount - (platformFee + deliveryFee);

    // ✅ Record transaction
    const transaction = await Transaction.create({
      user,
      vendor,
      order,
      amount,
      deliveryFee,
      platformFee,
      vendorShare,
      type: "credit",
      method: "card",
      status: "success",
      reference,
      metadata: data,
    });

    // ✅ Update vendor wallet
    const vendorWallet = await Wallet.findOne({ ownerId: vendor });
    if (vendorWallet) {
      vendorWallet.balance += vendorShare;
      vendorWallet.totalEarnings += vendorShare;
      vendorWallet.lastUpdated = new Date();
      await vendorWallet.save();
    }

    // ✅ Update platform wallet (static, only one)
    const platformWallet = await Wallet.findOne({ ownerType: "platform" });
    if (platformWallet) {
      platformWallet.balance += platformFee + deliveryFee;
      platformWallet.totalEarnings += platformFee + deliveryFee;
      await platformWallet.save();
    }

    res.status(200).json({
      message: "Payment verified & wallets updated",
      transaction,
    });
  } catch (error) {
    console.error("Paystack verify error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
// Explanation:

// Imagine ₦10,000 came in.

// Paystack tells us, “Yes! Payment was successful.”

// Your code divides it like:

// ₦8,500 → vendor wallet

// ₦1,500 → platform wallet

// Everyone’s balance gets updated. 💵