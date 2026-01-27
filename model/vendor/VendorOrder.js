import mongoose from "mongoose";

const vendorOrderSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    userOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },

    items: [
      {
        foodId: { type: mongoose.Schema.Types.ObjectId, ref: "Food" },
        variantId: { type: mongoose.Schema.Types.ObjectId, ref: "Variant" },
        variant: Object,
        quantity: Number,
        originalPrice: Number,
        vendorEarning: Number,
        metadata: { type: Object, default: {} },
      },
    ],

    commission: Number,
    vendorTotal: Number,
    deliveryShare: Number,

    orderStatus: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "preparing",
        "ready_for_pickup",
        "rider_assigned",
        "out_for_delivery",
        "delivered",
        "completed",
        "cancelled",
        "failed",
        "refunded",
      ],
      default: "pending",
    },
  },
  { timestamps: true }
);

const VendorOrder = mongoose.model("VendorOrder", vendorOrderSchema);

export default VendorOrder;
