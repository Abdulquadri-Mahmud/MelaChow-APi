import mongoose from "mongoose";

const walletSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "ownerModel",
      required: true,
    },
    ownerModel: {
      type: String,
      required: true,
      enum: ["Admin", "Vendor", "User", "Rider"],
    },
    balance: {
      type: Number,
      default: 0,
    },
    transactions: [
      {
        type: {
          type: String,
          enum: ["credit", "debit"],
          required: true,
        },
        amount: {
          type: Number,
          required: true,
        },
        // ─── Transaction classification for financial reporting ───────────
        // Enables escrow reporting without separate escrow wallets.
        // Query: adminWallet.transactions.filter(t => t.transactionType === 'escrow_hold')
        transactionType: {
            type: String,
            enum: [
                'commission',       // Platform 10% cut credited to admin
                'escrow_hold',      // Vendor food revenue held pending delivery
                'escrow_release',   // Escrow released to vendor after delivery
                'delivery_fee',     // Delivery fee held in admin wallet
                'rider_payout',     // Rider delivery earnings paid out
                'refund',           // Customer refund debited from admin
                'order_payment',    // Customer wallet debit for order
                'top_up',           // Customer wallet top-up via Paystack
                'manual_credit',    // Admin manual adjustment
                'manual_debit',     // Admin manual adjustment
            ],
            default: null,         // null for legacy transactions — do not require
        },
        description: String,
        orderId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Order",
          default: null
        },
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

// ─── Query Performance Indexes ────────────────────────────────────────────

// ownerId and ownerModel are ALWAYS queried together — compound unique index
// Prevents duplicate wallets and makes every wallet lookup O(log n)
walletSchema.index({ ownerId: 1, ownerModel: 1 }, { unique: true });

const Wallet = mongoose.model("Wallet", walletSchema);
export default Wallet;
