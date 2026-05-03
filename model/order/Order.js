import mongoose from "mongoose";

/**
 * Schema for each item in an order
 * (NO delivery fee here)
 */
/**
 * selected_options subdocument — one entry per customer choice
 * e.g. "Amala (1 wrap) +₦300" selected from "Choose your swallow" group
 */
const selectedOptionSchema = new mongoose.Schema(
  {
    group_id:             { type: mongoose.Schema.Types.ObjectId, default: null },
    group_name:           { type: String, default: "" },
    option_id:            { type: mongoose.Schema.Types.ObjectId, default: null },
    label:                { type: String, default: "" },
    price_modifier_naira: { type: Number, default: 0 },
    quantity:             { type: Number, default: 1 },
  },
  { _id: false }
);

/**
 * Schema for each item in an order
 * Explicit fields for all cart payload properties.
 * metadata field retained for backward compatibility.
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

  // ─── Portion reference (food items only) ──────
  portionId: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     "MenuItemPortion",
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

  // Cached store name — avoids populate on display
  storeName: { type: String, default: "" },

  variant:   { type: Object, default: {} },
  name:      { type: String, default: "" },
  image_url: { type: String, default: "" },

  // portion_label: human-readable size label (e.g. "Small Bowl")
  portion_label: { type: String, default: "" },

  // quantity: total number of this configured item
  quantity: { type: Number, required: true },

  // portion_quantity: multiplier for the portion itself
  // (e.g. 2 x Small Bowl as a single cart entry)
  // Defaults to 1 — most items will not use this
  portion_quantity: { type: Number, default: 1 },

  price: { type: Number, required: true },
  note:  { type: String, default: "" },

  // ─── Dietary & category metadata ──────────────
  // Stored explicitly for filtering and analytics
  dietary_type: {
    type:    String,
    enum:    ["veg", "non-veg", "vegan", "halal", "kosher", "mixed", ""],
    default: "",
  },
  item_type: {
    type:    String,
    enum:    ["FOOD", "DRINK", "SIDE", "PROTEIN", "SWALLOW",
              "SOUP", "DESSERT", "OTHER", "combo", ""],
    default: "",
  },

  // ─── Selected options (explicit subdocument) ──
  // Promoted from metadata.selected_options for queryability
  selected_options: {
    type:    [selectedOptionSchema],
    default: [],
  },

  // ─── Kept for backward compatibility ──────────
  // Existing orders have data here. Do not remove.
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
  addressLine: { type: String },

  // Frontend contract fields (cityName/stateName)
  cityName: { type: String },
  stateName: { type: String },

  // Schema fields — populated from cityName/stateName
  // in createOrderV2 before saving.
  // NOT required — normalization handles the mapping.
  city: { type: String },
  state: { type: String },

  cityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "City",
  },
  stateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "State",
  },
  name: { type: String },
  phone: { type: String },
  address: { type: String },
  coordinates: {
    lat: { type: Number },
    lng: { type: Number },
  },
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

    // 💳 Service Fee Snapshot
    // Collected by platform. SNAPSHOT at order time.
    serviceFee: {
        type: Number,
        default: 0,
    },

    // 🏷️ Discount Snapshot (Added for Discount System)
    appliedDiscount: {
      code: String,
      type: String, // FIXED / PERCENTAGE
      amount: Number,
      scope: String,
      label: String,
      fundedBy: String,
      _id: false // No ID needed for subdocument
    },

    // 🎁 Free Delivery Promo — first-order subsidy tracking
    freeDeliveryPromo: {
      eligible:            { type: Boolean, default: false },
      claimed:             { type: Boolean, default: false },
      promoId:             { type: mongoose.Schema.Types.ObjectId, ref: "FreeDeliveryPromo" },
      // SHA-256 of IP — select: false so it never appears in API responses
      hashedIp:            { type: String, select: false },
      hashedDeviceId:      { type: String, select: false },
      phoneHash:           { type: String, select: false },
      // The delivery fee that was waived (what platform is subsidising, in ₦)
      originalDeliveryFee: { type: Number, default: 0 },
      _id: false,
    },

    // 🏪 Vendor-Sponsored Free Delivery Promo
    vendorDeliveryPromo: {
      applied:             { type: Boolean, default: false },
      claimed:             { type: Boolean, default: false },
      promoId:             { type: mongoose.Schema.Types.ObjectId, ref: "VendorDeliveryPromo" },
      vendorId:            { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
      hashedDeviceId:      { type: String, select: false },
      phoneHash:           { type: String, select: false },
      originalDeliveryFee: { type: Number, default: 0 },
      _id: false,
    },

    total: { type: Number, required: true },

    orderId: {
      type: String,
      required: true,
      unique: true,
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },

    paymentReference: {
      type: String,
      unique: true,
      sparse: true,
    },

    idempotencyKey: {
      type: String,
      sparse: true,   // allows multiple null values
      unique: true,   // but only one doc per non-null key
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

    // Rider's actual payout for this delivery.
    // Set at delivery confirmation time in markDelivered.
    // For platform-managed riders: fixed payout (e.g. ₦600).
    // For vendor-managed riders: the vendor's delivery fee (cash paid by vendor).
    // Null for orders created before this field was added.
    riderEarnings: {
      type: Number,
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

// ─── Query Performance Indexes ────────────────────────────────────────────

// Customer order history — most recent first
orderSchema.index({ userId: 1, createdAt: -1 });

// Customer orders filtered by status (e.g. active orders page)
orderSchema.index({ userId: 1, orderStatus: 1 });

// Admin/platform order listing — all orders sorted by recency
orderSchema.index({ orderStatus: 1, createdAt: -1 });

// Rider active order lookup — used by getActiveOrder and markPickedUp/markDelivered
orderSchema.index({ riderId: 1, orderStatus: 1 });

// Vendor cross-reference — orders containing a specific restaurant's items
// Used when VendorOrder lookup needs to cross-reference back to parent Order
orderSchema.index({ "items.restaurantId": 1, orderStatus: 1 });

const Order =
  mongoose.models.Order || mongoose.model("Order", orderSchema);

export default Order;
