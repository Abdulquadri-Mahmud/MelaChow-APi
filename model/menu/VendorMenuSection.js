import mongoose from "mongoose";

const vendorMenuSectionSchema = new mongoose.Schema(
    {
        vendor_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            required: true,
            index: true,
        },
        name: {
            type: String, // e.g. "Afternoon Specials", "Our Rice Selections"
            required: true,
            trim: true,
        },
        description: {
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

// Sections are scoped by vendor
vendorMenuSectionSchema.index({ vendor_id: 1, is_visible: 1, sort_order: 1 });

const VendorMenuSection = mongoose.models.VendorMenuSection || mongoose.model("VendorMenuSection", vendorMenuSectionSchema);

export default VendorMenuSection;
