import mongoose from "mongoose";
const { ObjectId } = mongoose.Schema.Types;

const comboChoiceOptionSchema = new mongoose.Schema({
    label:          { type: String, required: true, trim: true },
    price_modifier: { type: Number, default: 0 },
    image_url:      { type: String, default: null },
    is_available:   { type: Boolean, default: true },
    sort_order:     { type: Number, default: 0 },
}, { _id: true });

const comboChoiceGroupSchema = new mongoose.Schema({
    name:           { type: String, required: true, trim: true },
    is_required:    { type: Boolean, default: false },
    min_selections: { type: Number, default: 0 },
    max_selections: { type: Number, default: 1 },
    sort_order:     { type: Number, default: 0 },
    options:        [comboChoiceOptionSchema],
}, { _id: true });

const comboItemSchema = new mongoose.Schema({
    vendor_id: {
        type: ObjectId, ref: "Vendor",
        required: true, index: true,
    },
    platform_category_id: {
        type: ObjectId, ref: "Category",
        required: true, index: true,
    },
    vendor_section_id: {
        type: ObjectId, ref: "VendorMenuSection",
        default: null, index: true,
    },
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: null },
    image_url:   { type: String, default: null },
    price:       { type: Number, required: true, min: 0 },
    dietary_type: {
        type: String,
        enum: ["veg", "non-veg", "vegan", "halal", "kosher", "mixed"],
        default: "mixed",
    },
    prep_time_minutes: { type: Number, default: null },
    tags:    [{ type: String }],
    contents:[{ type: String }],
    choice_groups: [comboChoiceGroupSchema],
    is_available: { type: Boolean, default: true },
    is_in_stock:  { type: Boolean, default: true },
    is_archived:  { type: Boolean, default: false },
    sort_order:   { type: Number, default: 0 },
    rating:       { type: Number, default: 0, min: 0, max: 5 },
    ratingCount:  { type: Number, default: 0, min: 0 },
}, { timestamps: true });

comboItemSchema.index({ vendor_id: 1, is_archived: 1, is_available: 1 });
comboItemSchema.index({ platform_category_id: 1, is_archived: 1 });
comboItemSchema.index({ vendor_id: 1, vendor_section_id: 1 });
comboItemSchema.index(
    { name: "text", description: "text", tags: "text", contents: "text" },
    { weights: { name: 10, tags: 5, contents: 3, description: 1 },
      name: "comboitem_text_search" }
);

comboItemSchema.methods.updateRating = async function (newRating) {
    const currentTotal = this.rating * this.ratingCount;
    this.ratingCount += 1;
    this.rating = Math.round(((currentTotal + newRating) / this.ratingCount) * 10) / 10;
    await this.save();
};

comboItemSchema.methods.removeRating = async function (removedRating) {
    if (this.ratingCount <= 1) {
        this.ratingCount = 0;
        this.rating = 0;
    } else {
        const currentTotal = this.rating * this.ratingCount;
        this.ratingCount -= 1;
        this.rating = Math.round(((currentTotal - removedRating) / this.ratingCount) * 10) / 10;
    }
    await this.save();
};

const ComboItem = mongoose.models.ComboItem
    || mongoose.model("ComboItem", comboItemSchema);

export default ComboItem;
