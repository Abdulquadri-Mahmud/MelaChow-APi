import mongoose from "mongoose";

const vendorOrderSchema = new mongoose.Schema(
  {
    restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
    userOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true },

    items: [
      {
        // ─── Type discriminator ─────────────────────
        type: {
          type:    String,
          enum:    ["item", "combo"],
          default: "item",
        },

        // ─── References ────────────────────────────
        foodId: {
          type:    mongoose.Schema.Types.ObjectId,
          ref:     "MenuItem",
          default: null,
        },
        portionId: {
          type:    mongoose.Schema.Types.ObjectId,
          ref:     "MenuItemPortion",
          default: null,
        },
        variantId: {
          type:    mongoose.Schema.Types.ObjectId,
          ref:     "MenuVariant",
          default: null,
        },

        // ─── Display fields ─────────────────────────
        name:          { type: String, default: "" },
        image_url:     { type: String, default: "" },
        portion_label: { type: String, default: "" },
        storeName:     { type: String, default: "" },

        variant: { type: Object, default: {} },

        // ─── Quantities ─────────────────────────────
        quantity:         { type: Number, default: 1 },
        portion_quantity: { type: Number, default: 1 },

        // ─── Pricing ────────────────────────────────
        originalPrice: { type: Number, default: 0 },
        vendorEarning: { type: Number, default: 0 },

        // ─── Dietary & category ─────────────────────
        dietary_type: {
          type:    String,
          enum:    ["veg", "non-veg", "vegan", "halal", "kosher",
                    "mixed", ""],
          default: "",
        },
        item_type: {
          type:    String,
          enum:    ["FOOD", "DRINK", "SIDE", "PROTEIN", "SWALLOW",
                    "SOUP", "DESSERT", "OTHER", "combo", ""],
          default: "",
        },

        // ─── Selected options (explicit subdocument) ─
        selected_options: [
          {
            group_id:             { type: mongoose.Schema.Types.ObjectId, default: null },
            group_name:           { type: String, default: "" },
            option_id:            { type: mongoose.Schema.Types.ObjectId, default: null },
            label:                { type: String, default: "" },
            price_modifier_naira: { type: Number, default: 0 },
            quantity:             { type: Number, default: 1 },
            _id:                  false,
          },
        ],

        // ─── Backward compatibility ──────────────────
        metadata: { type: Object, default: {} },

        note: { type: String, default: "" },
      },
    ],

    commission: Number,
    vendorTotal: Number,
    deliveryShare: Number,
    escrowAmount: { type: Number, default: 0 }, // food revenue held pending delivery
    escrowReleased: { type: Boolean, default: false }, // true after payout to vendor

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
  },
  { timestamps: true }
);

// ─── Query Performance Indexes ────────────────────────────────────────────

// Vendor order history — primary query pattern for vendor dashboard
vendorOrderSchema.index({ restaurantId: 1, createdAt: -1 });

// Vendor orders by status — used by getVendorOrdersByStatus controller
vendorOrderSchema.index({ restaurantId: 1, orderStatus: 1 });

// Parent order lookup — used in markPickedUp, markDelivered, assignment flows
vendorOrderSchema.index({ userOrderId: 1 });

// Rider assignment lookup within a vendor — used by assignRiderToOrder
vendorOrderSchema.index({ restaurantId: 1, riderId: 1 });

// Platform-wide rider order tracking
vendorOrderSchema.index({ riderId: 1, orderStatus: 1 });

const VendorOrder = mongoose.model("VendorOrder", vendorOrderSchema);

export default VendorOrder;
