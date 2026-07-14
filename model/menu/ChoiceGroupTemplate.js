import mongoose from "mongoose";

const { ObjectId } = mongoose.Schema.Types;

const choiceGroupTemplateOptionSchema = new mongoose.Schema(
    {
        label: { type: String, required: true, trim: true, maxlength: 80 },
        price_modifier: { type: Number, default: 0, min: 0 },
        image_url: { type: String, default: null, trim: true },
        is_available: { type: Boolean, default: true },
        track_stock: { type: Boolean, default: false },
        stock_quantity: { type: Number, default: 0, min: 0 },
        low_stock_threshold: { type: Number, default: 5, min: 0 },
        sort_order: { type: Number, default: 0 },
    },
    { _id: true }
);

const choiceGroupTemplateSchema = new mongoose.Schema(
    {
        vendor_id: {
            type: ObjectId,
            ref: "Vendor",
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 80,
        },
        image_url: { type: String, default: null, trim: true },
        is_required: {
            type: Boolean,
            default: false,
        },
        min_selections: {
            type: Number,
            default: 0,
            min: 0,
        },
        max_selections: {
            type: Number,
            default: 1,
            min: 1,
        },
        sort_order: {
            type: Number,
            default: 0,
        },
        options: {
            type: [choiceGroupTemplateOptionSchema],
            validate: {
                validator: (options) => Array.isArray(options) && options.length > 0,
                message: "A template must contain at least one option",
            },
        },
        is_archived: {
            type: Boolean,
            default: false,
            index: true,
        },
    },
    { timestamps: true }
);

choiceGroupTemplateSchema.index({ vendor_id: 1, is_archived: 1, sort_order: 1, createdAt: -1 });
choiceGroupTemplateSchema.index({ vendor_id: 1, name: 1 });

const ChoiceGroupTemplate =
    mongoose.models.ChoiceGroupTemplate ||
    mongoose.model("ChoiceGroupTemplate", choiceGroupTemplateSchema);

export default ChoiceGroupTemplate;
