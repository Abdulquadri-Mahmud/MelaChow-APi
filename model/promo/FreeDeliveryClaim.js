import mongoose from "mongoose";

const freeDeliveryClaimSchema = new mongoose.Schema(
  {
    // Hard unique constraint — one free delivery per account, ever
    userId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      unique:   true,
    },
    orderId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Order",
      required: true,
    },
    // SHA-256 of the raw IP address — never store the raw IP
    // NOT unique: multiple legitimate students share campus/hostel IPs.
    // Used as a soft fraud signal — queried for threshold checks.
    hashedIp: {
      type:     String,
      required: true,
    },
    // How much platform subsidised for this order (₦)
    deliveryFeeWaived: {
      type:     Number,
      required: true,
    },
    promoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "FreeDeliveryPromo",
    },
  },
  { timestamps: true }
);

// Fast userId lookup (uniqueness enforced by schema)
freeDeliveryClaimSchema.index({ userId: 1 });

// IP threshold queries — find all claims for a given IP
freeDeliveryClaimSchema.index({ hashedIp: 1 });

const FreeDeliveryClaim =
  mongoose.models.FreeDeliveryClaim ||
  mongoose.model("FreeDeliveryClaim", freeDeliveryClaimSchema);

export default FreeDeliveryClaim;
