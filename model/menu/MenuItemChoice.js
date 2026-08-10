import mongoose from "mongoose";

const menuItemChoiceGroupSchema = new mongoose.Schema(
    {
        menu_item_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MenuItem",
            required: true,
            index: true,
        },
        source_template_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ChoiceGroupTemplate",
            default: null,
            index: true,
        },
        name: {
            type: String, // e.g. "Choose Swallow", "Extra Toppings"
            required: true,
        },
        min_selections: {
            type: Number,
            default: 0, // 0 = optional
        },
        max_selections: {
            type: Number,
            default: 1, // 1 = single choice
        },
        is_required: {
            type: Boolean,
            default: false,
        },
        sort_order: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

const MenuItemChoiceGroup = mongoose.models.MenuItemChoiceGroup || mongoose.model("MenuItemChoiceGroup", menuItemChoiceGroupSchema);

const menuItemChoiceOptionSchema = new mongoose.Schema(
    {
        group_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MenuItemChoiceGroup",
            required: true,
            index: true,
        },
        // Present only for an option supplied by the vendor's Options Library.
        // This is what lets every menu item share one inventory record.
        source_template_option_id: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
            index: true,
        },
        label: {
            type: String, // e.g. "Eba", "Amala"
            required: true,
        },
        image_url: {
            type: String,
            trim: true,
            default: null,
        },
        price_modifier: {
            type: Number, // SNAPSHOT in kobo
            default: 0,
        },
        is_available: {
            type: Boolean,
            default: true,
        },
        track_stock: {
            type: Boolean,
            default: false,
        },
        stock_quantity: {
            type: Number,
            default: 0,
            min: 0,
        },
        low_stock_threshold: {
            type: Number,
            default: 5,
            min: 0,
        },
        sort_order: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

const MenuItemChoiceOption = mongoose.models.MenuItemChoiceOption || mongoose.model("MenuItemChoiceOption", menuItemChoiceOptionSchema);

export { MenuItemChoiceGroup, MenuItemChoiceOption };
