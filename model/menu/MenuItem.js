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
        rating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
        },
        ratingCount: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    { timestamps: true }
);

/**
 * Called when a new review is created for this item.
 * Recalculates the rolling average and increments count.
 * @param {number} newRating - integer 1–5
 */
menuItemSchema.methods.updateRating = async function (newRating) {
    const currentTotal = this.rating * this.ratingCount;
    this.ratingCount += 1;
    this.rating = Math.round(((currentTotal + newRating) / this.ratingCount) * 10) / 10;
    await this.save();
};

/**
 * Called when a review for this item is deleted.
 * Recalculates the rolling average and decrements count.
 * @param {number} removedRating - integer 1–5
 */
menuItemSchema.methods.removeRating = async function (removedRating) {
    if (this.ratingCount <= 1) {
        // Last review removed — reset to zero
        this.ratingCount = 0;
        this.rating = 0;
    } else {
        const currentTotal = this.rating * this.ratingCount;
        this.ratingCount -= 1;
        this.rating = Math.round(((currentTotal - removedRating) / this.ratingCount) * 10) / 10;
    }
    await this.save();
};

// fast search indexes
menuItemSchema.index({ vendor_id: 1, is_archived: 1, is_available: 1, is_in_stock: 1 });
menuItemSchema.index({ platform_category_id: 1, is_archived: 1, is_available: 1, is_in_stock: 1 });
menuItemSchema.index({ vendor_id: 1, vendor_section_id: 1 });
menuItemSchema.index({ vendor_id: 1, platform_category_id: 1 });

menuItemSchema.index(
    {
        name: "text",
        description: "text",
        tags: "text",
    },
    {
        weights: {
            name: 10, // name matches rank highest
            tags: 5,
            description: 1,
        },
        name: "menuitem_text_search",
    }
);

const MenuItem = mongoose.models.MenuItem || mongoose.model("MenuItem", menuItemSchema);

export default MenuItem;
