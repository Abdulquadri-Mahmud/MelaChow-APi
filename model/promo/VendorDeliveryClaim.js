import mongoose from "mongoose";

const vendorDeliveryClaimSchema = new mongoose.Schema(
  {
    promoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VendorDeliveryPromo",
      required: true,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    deliveryFeeWaived: {
      type: Number,
      required: true,
      min: 0,
    },
    hashedDeviceId: {
      type: String,
      default: null,
      select: false,
    },
    phoneHash: {
      type: String,
      default: null,
      select: false,
    },
  },
  { timestamps: true }
);

vendorDeliveryClaimSchema.index({ promoId: 1, userId: 1 }, { unique: true });
vendorDeliveryClaimSchema.index({ vendorId: 1, userId: 1 });
vendorDeliveryClaimSchema.index(
  { promoId: 1, hashedDeviceId: 1 },
  {
    unique: true,
    partialFilterExpression: { hashedDeviceId: { $type: "string" } },
  }
);
vendorDeliveryClaimSchema.index(
  { promoId: 1, phoneHash: 1 },
  {
    unique: true,
    partialFilterExpression: { phoneHash: { $type: "string" } },
  }
);

const VendorDeliveryClaim =
  mongoose.models.VendorDeliveryClaim ||
  mongoose.model("VendorDeliveryClaim", vendorDeliveryClaimSchema);

export default VendorDeliveryClaim;
