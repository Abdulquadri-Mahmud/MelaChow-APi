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
        // Soft delete support — never hard-delete sections
        deleted_at: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

// Sections are scoped by vendor
// Include deleted_at in index so queries scoped to deleted_at: null use it efficiently
vendorMenuSectionSchema.index({ vendor_id: 1, is_visible: 1, sort_order: 1, deleted_at: 1 });

const VendorMenuSection = mongoose.models.VendorMenuSection || mongoose.model("VendorMenuSection", vendorMenuSectionSchema);

export default VendorMenuSection;
