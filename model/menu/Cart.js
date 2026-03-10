import mongoose from "mongoose";

const cartSchema = new mongoose.Schema(
    {
        customer_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["ACTIVE", "CHECKED_OUT", "ABANDONED", "EXPIRED"],
            default: "ACTIVE",
        },
        expires_at: {
            type: Date, // enforced by TTL cleanup
            required: true,
        },
    },
    { timestamps: true }
);

// A customer can only have ONE ACTIVE cart
cartSchema.index(
    { customer_id: 1 },
    { unique: true, partialFilterExpression: { status: "ACTIVE" } }
);

const Cart = mongoose.models.Cart || mongoose.model("Cart", cartSchema);

const vendorSubCartSchema = new mongoose.Schema(
    {
        cart_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Cart",
            required: true,
            index: true,
        },
        vendor_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            required: true,
            index: true,
        },
        vendor_name: {
            type: String, // snapshot
            required: true,
        },
    },
    { timestamps: true }
);

// Only one sub-cart per vendor per cart
vendorSubCartSchema.index({ cart_id: 1, vendor_id: 1 }, { unique: true });

const VendorSubCart = mongoose.models.VendorSubCart || mongoose.model("VendorSubCart", vendorSubCartSchema);

const cartLineItemSchema = new mongoose.Schema(
    {
        vendor_sub_cart_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "VendorSubCart",
            required: true,
            index: true,
        },
        line_item_type: {
            type: String,
            enum: ["PORTION_ITEM", "VARIANT_ITEM"],
            required: true,
        },
        // For PORTION_ITEM
        menu_item_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MenuItem",
            default: null,
        },
        portion_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MenuItemPortion",
            default: null,
        },
        selected_choices: [
            {
                group_id: mongoose.Schema.Types.ObjectId,
                group_name: String, // snapshot
                options: [
                    {
                        option_id: mongoose.Schema.Types.ObjectId,
                        label: String, // snapshot
                        price_modifier: Number, // snapshot in kobo
                    },
                ],
            },
        ],
        unit_price: {
            type: Number, // kobo
            default: null,
        },

        // For VARIANT_ITEM
        variant_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MenuVariant",
            default: null,
        },
        variant_choices: [
            {
                component_id: mongoose.Schema.Types.ObjectId,
                group_id: mongoose.Schema.Types.ObjectId,
                group_name: String, // snapshot
                options: [
                    {
                        option_id: mongoose.Schema.Types.ObjectId,
                        label: String, // snapshot
                        price_modifier: Number, // snapshot in kobo
                    },
                ],
            },
        ],
        base_price: {
            type: Number, // kobo
            default: null,
        },

        // Shared
        choices_price: {
            type: Number, // snapshot SUM of mods
            default: 0,
        },
        total_price: {
            type: Number, // (unit_price/base_price + choices_price) * quantity
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
        },
        special_instructions: {
            type: String,
            default: null,
        },
        added_at: {
            type: Date,
            default: Date.now,
        },
        item_status_at_add: {
            type: String,
            enum: ["AVAILABLE", "SOLD_OUT", "UNAVAILABLE"],
            default: "AVAILABLE",
        },
    },
    { timestamps: true }
);

const CartLineItem = mongoose.models.CartLineItem || mongoose.model("CartLineItem", cartLineItemSchema);

export { Cart, VendorSubCart, CartLineItem };
