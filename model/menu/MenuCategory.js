import mongoose from "mongoose";

const menuCategorySchema = new mongoose.Schema(
    {
        vendor_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            required: true,
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
        sort_order: {
            type: Number,
            default: 0,
        },
        is_visible: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

// Category lookups are scoped by vendor and visibility
menuCategorySchema.index({ vendor_id: 1, is_visible: 1 });

const MenuCategory = mongoose.models.MenuCategory || mongoose.model("MenuCategory", menuCategorySchema);

export default MenuCategory;
