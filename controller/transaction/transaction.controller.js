// controllers/transaction.controller.js
import axios from "axios";
import dotenv from "dotenv";
import transactionModels from "../../model/transacrion/transaction.models.js";

dotenv.config();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

// Initialize payment
export const initializePayment = async (req, res) => {
  try {
    const { email, amount, orderId, method = "card" } = req.body;
    const userId = req.userId;
    const normalizedAmount = Number(amount);
    const customerEmail = req.user?.email || email;

    if (!customerEmail) {
      return res.status(400).json({
        status: false,
        message: "Customer email is required to initialize payment",
      });
    }

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return res.status(400).json({
        status: false,
        message: "A valid payment amount is required",
      });
    }

    const reference = `TRX_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    // Create a pending transaction record
    const transaction = await transactionModels.create({
      user: userId,
      order: orderId,
      amount: normalizedAmount,
      type: "debit",
      method,
      reference,
      status: "pending",
    });

    // Initialize Paystack
    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      { email: customerEmail, amount: Math.round(normalizedAmount * 100), reference },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    return res.status(200).json({
      status: true,
      message: "Payment initialized",
      data: {
        authorization_url: response.data.data.authorization_url,
        access_code: response.data.data.access_code,
        reference,
      },
    });
  } catch (error) {
    console.error("Payment initialization error:", error.response?.data || error.message);
    res.status(500).json({
      status: false,
      message: "Failed to initialize payment",
    });
  }
};

// Verify payment (after Paystack redirects)
export const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).json({ status: false, message: "Payment reference is required" });
    }

    const transaction = await transactionModels.findOne({ reference });

    if (!transaction) {
      return res.status(404).json({ status: false, message: "Transaction not found" });
    }

    if (String(transaction.user) !== String(req.userId)) {
      return res.status(403).json({ status: false, message: "This payment does not belong to this customer" });
    }

    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    const data = response.data.data;

    if (data.status === "success") {
      const expectedAmount = Math.round(Number(transaction.amount) * 100);
      const paidAmount = Number(data.amount);

      if (paidAmount !== expectedAmount) {
        transaction.status = "failed";
        await transaction.save();

        return res.status(409).json({
          status: false,
          message: "Payment amount mismatch. Please contact support.",
        });
      }

      transaction.status = "success";
      await transaction.save();

      return res.status(200).json({
        status: true,
        message: "Payment verified successfully",
        data,
      });
    } else {
      transaction.status = "failed";
      await transaction.save();
      return res.status(400).json({ status: false, message: "Payment failed" });
    }
  } catch (error) {
    console.error("Payment verification error:", error.response?.data || error.message);
    res.status(500).json({
      status: false,
      message: "Payment verification failed",
    });
  }
};


//  * PAYSTACK WEBHOOK HANDLER
//  * -------------------------------
//  * This receives a notification from Paystack when a payment succeeds.
//  * We then:
//  * 1. Create a transaction record
//  * 2. Split the amount into:
//  *    - Platform wallet (commission + delivery)
//  *    - Vendor wallet (vendor share)
//  */

export const handlePaystackWebhook = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: "Legacy transaction webhook is disabled. Use /api/orders/webhook for order payments.",
  });

  try {
    const event = req.body.event;

    // ✅ Only handle successful charge events
    if (event !== "charge.success") {
      return res.status(200).json({ message: "Event ignored." });
    }

    const data = req.body.data;
    const reference = data.reference;

    // Check if transaction already exists
    const existingTx = await Transaction.findOne({ reference });
    if (existingTx) {
      return res.status(200).json({ message: "Transaction already processed." });
    }

    // Extract needed details (customize as needed)
    const amount = data.amount / 100; // Paystack sends in kobo
    const vendorId = req.query.vendor; // using query instead of param
    const userId = req.query.user;
    const orderId = req.query.order;

    // Define how you split the money
    const deliveryFee = 500;
    const platformFee = amount * 0.1; // 10% commission
    const vendorShare = amount - (deliveryFee + platformFee);

    // ✅ 1. Create Transaction record
    const transaction = await Transaction.create({
      user: userId,
      vendor: vendorId,
      order: orderId,
      amount,
      platformFee,
      deliveryFee,
      vendorShare,
      type: "credit",
      method: "card",
      status: "success",
      reference,
      metadata: data,
    });

    // ✅ 2. Credit Platform Wallet
    let platformWallet = await Wallet.findOne({ ownerType: "platform" });
    if (!platformWallet) {
      platformWallet = await Wallet.create({ ownerType: "platform", balance: 0 });
    }
    platformWallet.balance += platformFee + deliveryFee;
    await platformWallet.save();

    // ✅ 3. Credit Vendor Wallet
    let vendorWallet = await Wallet.findOne({
      ownerType: "vendor",
      ownerId: vendorId,
    });
    if (!vendorWallet) {
      vendorWallet = await Wallet.create({
        ownerType: "vendor",
        ownerId: vendorId,
        balance: 0,
      });
    }
    vendorWallet.balance += vendorShare;
    await vendorWallet.save();

    // ✅ Done
    res.status(200).json({
      message: "Payment processed and wallets updated.",
      transaction,
    });
  } catch (error) {
    console.error("Webhook Error:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
