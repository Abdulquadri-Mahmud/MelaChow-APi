import mongoose from "mongoose";

const vendorDeliveryPromoSchema = new mongoose.Schema(
  {
    vendorId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Vendor",
      required: true,
      // A vendor can have at most one active promo at a time.
      // Enforced at the application layer in the admin controller,
      // not as a DB unique index (past inactive promos are kept for history).
    },
    isActive:   { type: Boolean, default: false, index: true },
    startsAt:   { type: Date, required: true },
    endsAt:     { type: Date, required: true },
    // Maximum number of free-delivery orders this promo covers.
    // null = unlimited within the date range (not recommended — set a cap).
    maxOrders:  { type: Number, default: null },
    usedOrders: { type: Number, default: 0 },
    // Internal admin note: e.g. "Vendor paid ₦30,000 on 26/04/2026 via bank transfer"
    adminNote:  { type: String, default: "" },
  },
  { timestamps: true }
);

// Fast lookup: active promo for a specific vendor (used at order creation)
vendorDeliveryPromoSchema.index({ vendorId: 1, isActive: 1 });

// Admin listing: all promos sorted by recency
vendorDeliveryPromoSchema.index({ createdAt: -1 });

const VendorDeliveryPromo =
  mongoose.models.VendorDeliveryPromo ||
  mongoose.model("VendorDeliveryPromo", vendorDeliveryPromoSchema);

export default VendorDeliveryPromo;
