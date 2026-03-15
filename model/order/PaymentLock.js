import mongoose from "mongoose";

/**
 * PaymentLock — distributed mutex for payment verification.
 * Prevents two simultaneous verify requests for the same
 * reference from both crediting vendor wallets.
 *
 * The unique index on `reference` means only ONE lock
 * document can exist per reference at any time.
 * TTL of 300s auto-cleans stale locks if the server
 * crashes mid-processing.
 */
const paymentLockSchema = new mongoose.Schema({
  reference: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
  },
  createdAt: {
    type:    Date,
    default: Date.now,
    expires: 300, // auto-delete after 5 minutes (TTL index)
  },
});

const PaymentLock =
  mongoose.model("PaymentLock", paymentLockSchema);

export default PaymentLock;
