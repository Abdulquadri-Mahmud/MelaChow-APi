import mongoose from "mongoose";

const menuItemSchema = new mongoose.Schema(
    {
        vendor_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            required: true,
            index: true,
        },
        platform_category_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            required: true,
            index: true,
        },
        vendor_section_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "VendorMenuSection",
            default: null,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: null,
        },
        image_url: {
            type: String,
            default: null,
        },
        item_type: {
            type: String,
            enum: ["FOOD", "DRINK", "SIDE", "PROTEIN", "SWALLOW", "SOUP", "DESSERT", "OTHER"],
            required: true,
            default: "FOOD",
        },
        dietary_type: {
            type: String,
            enum: ["veg", "non-veg", "vegan", "halal", "kosher", "mixed"],
            default: "mixed",
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
        category_deactivated: {
            type: Boolean,
            default: false, // Flagged if platform category becomes inactive
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

// fast search indexes
menuItemSchema.index({ vendor_id: 1, is_archived: 1, is_available: 1, is_in_stock: 1 });
menuItemSchema.index({ platform_category_id: 1, is_archived: 1, is_available: 1, is_in_stock: 1 });
menuItemSchema.index({ vendor_id: 1, vendor_section_id: 1 });
menuItemSchema.index({ vendor_id: 1, platform_category_id: 1 });

const MenuItem = mongoose.models.MenuItem || mongoose.model("MenuItem", menuItemSchema);

export default MenuItem;
