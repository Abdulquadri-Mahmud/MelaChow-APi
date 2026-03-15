import mongoose from "mongoose";

/**
 * Schema for each item in an order
 * (NO delivery fee here)
 */
const orderItemSchema = new mongoose.Schema({
  // ─── Type discriminator ───────────────────────
  type: {
    type:    String,
    enum:    ["item", "combo"],
    default: "item",
  },

  // ─── Food item fields ─────────────────────────
  // foodId refs MenuItem (not legacy Food model)
  foodId: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     "MenuItem",
    default: null,
  },

  // ─── Combo fields ─────────────────────────────
  variantId: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     "MenuVariant",
    default: null,
  },

  // ─── Shared fields ────────────────────────────
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  "Vendor",
  },
  variant:  { type: Object, default: {} },
  name:     { type: String },
  image_url: { type: String, default: "" },
  quantity: { type: Number, required: true },
  price:    { type: Number, required: true },
  note:     { type: String, default: "" },
  metadata: { type: Object, default: {} },
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

    // 🏷️ Discount Snapshot (Added for Discount System)
    appliedDiscount: {
      code: String,
      type: String, // FIXED / PERCENTAGE
      amount: Number,
      scope: String,
      label: String,
      _id: false // No ID needed for subdocument
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

    idempotencyKey: {
      type:   String,
      sparse: true,   // allows multiple null values
      unique: true,   // but only one doc per non-null key
      index:  true,
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
    riderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Rider",
      default: null,
    },
    statusLog: [
      {
        status: String,
        changedBy: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

const Order =
  mongoose.models.Order || mongoose.model("Order", orderSchema);

export default Order;
