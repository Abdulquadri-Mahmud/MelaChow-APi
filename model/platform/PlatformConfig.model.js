import mongoose from "mongoose";

/**
 * Singleton platform configuration document.
 * Only ONE document exists (type: "singleton").
 * Admin updates propagate platform-wide immediately on next order/delivery.
 *
 * Design: all financial defaults mirror current hardcoded values so the
 * platform behaves identically if no admin has touched this yet.
 */
const platformConfigSchema = new mongoose.Schema(
  {
    // Singleton enforcement key — never expose to client
    type: {
      type: String,
      default: "singleton",
    },

    // ── Delivery Spread ───────────────────────────────────────────────────
    // Customer pays deliveryFee (set per city or per vendor override).
    // Rider receives riderFixedPayout (fixed amount).
    // Platform retains spread = deliveryFee - riderFixedPayout.
    //
    // If deliveryFee < riderFixedPayout, rider receives deliveryFee
    // and spread is ₦0. This is a business risk admin should avoid
    // by keeping riderFixedPayout ≤ the lowest city delivery fee.
    riderFixedPayout: {
      type: Number,
      default: 600,
      min: [0, "Rider payout cannot be negative"],
    },

    // ── Commission ────────────────────────────────────────────────────────
    // Percentage of vendor food subtotal taken by platform.
    // Currently disabled (commissionEnabled: false, rate: 0).
    // Enable post-launch once vendor trust is established.
    commissionEnabled: {
      type: Boolean,
      default: false,
    },
    commissionRate: {
      type: Number,
      default: 0,
      min: [0, "Commission rate cannot be negative"],
      max: [100, "Commission rate cannot exceed 100%"],
    },

    // ── Service Fee ───────────────────────────────────────────────────────
    // Flat or percentage fee charged to customer per order.
    // NEVER applied when any delivery promo is active for the order
    // (either platform first-order promo or vendor-sponsored promo).
    //
    // Rationale: customer receiving a promo benefit should not also
    // be hit with a service fee in the same transaction.
    serviceFeeEnabled: {
      type: Boolean,
      default: false,
    },
    serviceFeeType: {
      type: String,
      enum: ["fixed", "percentage"],
      default: "fixed",
    },
    // For fixed: naira amount (e.g., 100 = ₦100)
    // For percentage: percentage value (e.g., 2.5 = 2.5%)
    serviceFeeValue: {
      type: Number,
      default: 0,
      min: [0, "Service fee value cannot be negative"],
    },
    // Hard cap prevents percentage fee from becoming unreasonable on large orders
    serviceFeeCap: {
      type: Number,
      default: 500,
      min: [0, "Service fee cap cannot be negative"],
    },

    // ── Rider payout schedule ─────────────────────────────────────────────
    riderPayoutHour: {
      type: Number,
      default: 10,
      min: [0, "Payout hour cannot be negative"],
      max: [23, "Payout hour must be a valid hour"]
    },

    // ── Audit ─────────────────────────────────────────────────────────────
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true }
);

// Unique index on type enforces singleton — findOneAndUpdate with upsert is safe
platformConfigSchema.index({ type: 1 }, { unique: true });

const PlatformConfig = mongoose.model("PlatformConfig", platformConfigSchema);
export default PlatformConfig;
