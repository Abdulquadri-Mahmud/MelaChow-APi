import mongoose from "mongoose";

const menuItemSchema = new mongoose.Schema(
    {
        vendor_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            required: true,
            index: true,
        },
        category_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MenuCategory",
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
        item_type: {
            type: String,
            enum: ["FOOD", "DRINK", "SIDE", "PROTEIN", "SWALLOW", "SOUP", "DESSERT", "OTHER"],
            required: true,
        },
        is_available: {
            type: Boolean,
            default: true, // VENDOR DECISION: deliberate on/off toggle
        },
        is_in_stock: {
            type: Boolean,
            default: true, // OPERATIONAL: sold out today / restocked
        },
        is_archived: {
            type: Boolean,
            default: false, // soft delete
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

// Fast menu load index
menuItemSchema.index({ vendor_id: 1, is_archived: 1, is_available: 1, is_in_stock: 1 });
// Weighted Text Index for Search
menuItemSchema.index(
    {
        name: "text",
        description: "text",
        tags: "text",
    },
    {
        weights: {
            name: 5,
            tags: 3,
            description: 1,
        }
    }
);

const MenuItem = mongoose.models.MenuItem || mongoose.model("MenuItem", menuItemSchema);

export default MenuItem;
