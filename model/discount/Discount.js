import mongoose from "mongoose";

const discountSchema = new mongoose.Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
        },
        // 🏷️ Discount Logic
        type: {
            type: String,
            enum: ["PERCENTAGE", "FIXED"],
            required: true,
        },
        value: {
            type: Number,
            required: true, // e.g., 10 (for 10%) or 1000 (for ₦1000)
        },
        // 🎯 Scope (Where it applies)
        scope: {
            type: String,
            enum: [
                "GLOBAL_ORDER",   // Applies to total order subtotal (Platform wide)
                "VENDOR_ORDER",   // Applies to total order subtotal (Specific Vendor)
                "SPECIFIC_ITEMS", // Applies to specific food items (e.g. BOGO)
                "DELIVERY_FEE",   // Applies to delivery fee only
            ],
            required: true,
        },
        // 🔗 Constraints & Relations
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            // Required if scope is VENDOR_ORDER or SPECIFIC_ITEMS (unless global platform promo on items)
        },
        targetFoodIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Food",
            },
        ],
        minOrderAmount: {
            type: Number,
            default: 0,
        },
        maxDiscountAmount: {
            type: Number,
            // Useful for percentage discounts (e.g. 50% off up to ₦2000)
            default: null,
        },
        // ⏳ Usage & Time
        isActive: {
            type: Boolean,
            default: true,
        },
        startDate: {
            type: Date,
            default: Date.now,
        },
        endDate: {
            type: Date,
        },
        usageLimit: {
            type: Number, // Total times this code can be used globally
            default: null,
        },
        usageCount: {
            type: Number,
            default: 0,
        },
        userUsageLimit: {
            type: Number, // How many times a single user can use it
            default: 1,
        },
        // 👤 Funding (Accounting)
        fundedBy: {
            type: String,
            enum: ["PLATFORM", "VENDOR"],
            required: true,
            default: "VENDOR",
        },
    },
    { timestamps: true }
);

// Indexes for fast lookup
discountSchema.index({ code: 1 });
discountSchema.index({ vendorId: 1 });
discountSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

const Discount = mongoose.model("Discount", discountSchema);

export default Discount;
