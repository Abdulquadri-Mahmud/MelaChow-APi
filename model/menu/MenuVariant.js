import mongoose from "mongoose";

const menuVariantSchema = new mongoose.Schema(
    {
        vendor_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            required: true,
            index: true,
        },
        name: {
            type: String, // e.g. "Rice Combo", "Amala Special"
            required: true,
        },
        description: {
            type: String,
            default: null,
        },
        image_url: {
            type: String,
            default: null,
        },
        price: {
            type: Number, // SNAPSHOT in kobo
            required: true,
        },
        is_available: {
            type: Boolean,
            default: true,
        },
        is_in_stock: {
            type: Boolean,
            default: true,
        },
        is_archived: {
            type: Boolean,
            default: false,
        },
        sort_order: {
            type: Number,
            default: 0,
        },
        prep_time_minutes: {
            type: Number,
            default: null,
        },
        tags: [
            {
                type: String,
            },
        ],
    },
    { timestamps: true }
);

const MenuVariant = mongoose.models.MenuVariant || mongoose.model("MenuVariant", menuVariantSchema);

const menuVariantComponentSchema = new mongoose.Schema(
    {
        variant_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MenuVariant",
            required: true,
            index: true,
        },
        component_type: {
            type: String,
            enum: ["FIXED", "CHOICE_GROUP"],
            required: true,
        },
        // If FIXED - item is locked in
        menu_item_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MenuItem",
            default: null,
        },
        portion_id: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        quantity: {
            type: Number,
            default: 1, // "2 pieces of chicken in this combo"
        },
        label: {
            type: String,
            default: null, // "Jollof Rice (Large)"
        },
        // If CHOICE_GROUP - customer picks from options
        choice_group_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "VariantChoiceGroup",
            default: null,
        },
        sort_order: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

const MenuVariantComponent = mongoose.models.MenuVariantComponent || mongoose.model("MenuVariantComponent", menuVariantComponentSchema);

const variantChoiceGroupSchema = new mongoose.Schema(
    {
        variant_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MenuVariant",
            required: true,
            index: true,
        },
        name: {
            type: String, // "Choose Your Protein", "Pick a Drink"
            required: true,
        },
        min_selections: {
            type: Number,
            default: 1, // must pick at least one
        },
        max_selections: {
            type: Number,
            default: 1, // can only pick one
        },
        is_required: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

const VariantChoiceGroup = mongoose.models.VariantChoiceGroup || mongoose.model("VariantChoiceGroup", variantChoiceGroupSchema);

const variantChoiceOptionSchema = new mongoose.Schema(
    {
        group_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "VariantChoiceGroup",
            required: true,
            index: true,
        },
        menu_item_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MenuItem",
            required: true,
        },
        portion_id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        label: {
            type: String, // override label if different from MenuItem.name
            default: null,
        },
        price_modifier: {
            type: Number, // SNAPSHOT in kobo
            default: 0, // 0 = included
        },
        is_available: {
            type: Boolean,
            default: true,
        },
        sort_order: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

const VariantChoiceOption = mongoose.models.VariantChoiceOption || mongoose.model("VariantChoiceOption", variantChoiceOptionSchema);

export { MenuVariant, MenuVariantComponent, VariantChoiceGroup, VariantChoiceOption };
