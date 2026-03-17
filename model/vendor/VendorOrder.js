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

const VendorOrder = mongoose.model("VendorOrder", vendorOrderSchema);

export default VendorOrder;
