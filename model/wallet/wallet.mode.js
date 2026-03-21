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
