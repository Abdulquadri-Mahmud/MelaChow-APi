// models/Transaction.js
import mongoose from "mongoose";

/**
 * Transaction Schema
 * -------------------------------
 * Stores all payments made through Paystack.
 * This helps track who paid what, and how money was split.
 */
const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },

    amount: { type: Number, required: true }, // total amount paid by user
    platformFee: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    vendorShare: { type: Number, default: 0 },

    type: {
      type: String,
      enum: ["credit", "debit"], // credit = money in, debit = money out
      required: true,
    },

    method: {
      type: String,
      enum: ["wallet", "card", "cash"],
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "success", "failed"],
      default: "pending",
    },

    reference: {
      type: String,
      unique: true, // ensure we don't process a payment twice
    },

    metadata: Object, // optional - store Paystack response, order info etc.
  },
  { timestamps: true }
);

export default mongoose.models.Transaction ||
  mongoose.model("Transaction", transactionSchema);
