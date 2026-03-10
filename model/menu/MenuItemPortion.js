import mongoose from "mongoose";

const menuItemPortionSchema = new mongoose.Schema(
    {
        menu_item_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MenuItem",
            required: true,
            index: true,
        },
        label: {
            type: String,
            required: true, // e.g. "Small", "1 Portion"
        },
        price: {
            type: Number, // SNAPSHOT in kobo
            required: true,
        },
        is_default: {
            type: Boolean,
            default: false,
        },
        is_available: {
            type: Boolean,
            default: true,
        },
        is_in_stock: {
            type: Boolean,
            default: true,
        },
        max_quantity: {
            type: Number,
            default: null,
        },
        sort_order: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

// Portion lookups are per item
menuItemPortionSchema.index({ menu_item_id: 1, is_available: 1, is_in_stock: 1 });

// Ensure only one default portion per item
menuItemPortionSchema.index(
    { menu_item_id: 1, is_default: 1 },
    { unique: true, partialFilterExpression: { is_default: true } }
);

const MenuItemPortion = mongoose.models.MenuItemPortion || mongoose.model("MenuItemPortion", menuItemPortionSchema);

export default MenuItemPortion;
