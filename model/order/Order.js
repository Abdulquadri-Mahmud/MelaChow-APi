import mongoose from "mongoose";

/**
 * Schema for each item in an order
 * (NO delivery fee here)
 */
const orderItemSchema = new mongoose.Schema({
  foodId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Food",
    required: true,
  },

  variant: {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String },
  },

  note: { type: String, default: "" },

  quantity: { type: Number, required: true },
  price: { type: Number, required: true },

  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Vendor",
    required: true,
  },

  metadata: { type: Object, default: {} }, // Stores choices, etc.
});

/**
 * Schema for per-vendor delivery fees
 */
const vendorDeliveryFeeSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    deliveryFee: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

/**
 * Delivery address
 */
const deliveryAddressSchema = new mongoose.Schema({
  addressLine: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  label: { type: String },
  phone: { type: String, required: true },
});

/**
 * Main Order Schema
 */
const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: [orderItemSchema],

    vendorDeliveryFees: {
      type: [vendorDeliveryFeeSchema],
      required: true,
    },

    deliveryAddress: {
      type: deliveryAddressSchema,
      required: true,
    },

    phone: { type: String, required: true },

    subtotal: { type: Number, required: true },

    deliveryFee: {
      type: Number,
      required: true, // sum of vendorDeliveryFees
    },

    total: { type: Number, required: true },

    orderId: {
      type: String,
      required: true,
      unique: true,
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },

    paymentReference: {
      type: String,
      unique: true,
      sparse: true,
    },

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

const Order =
  mongoose.models.Order || mongoose.model("Order", orderSchema);

export default Order;
