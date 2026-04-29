import Discount from "../../model/discount/Discount.js";
import discountService from "../../services/discount.service.js";
import Food from "../../model/vendor/food.model.js";

/**
 * 🔍 Verify a discount code
 * @route POST /api/discounts/verify
 * @body { code, vendorId, subtotal, items, deliveryFee }
 */
export const verifyDiscount = async (req, res) => {
    try {
        const { code, vendorId, subtotal, items, deliveryFee } = req.body;
        const userId = req.user ? req.user._id : null;

        if (!code) {
            return res.status(400).json({ success: false, message: "Discount code is required" });
        }

        // 1. Validate
        const validation = await discountService.validateDiscount(code, {
            userId,
            vendorId,
            subtotal: Number(subtotal),
            items: items || []
        });

        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.error
            });
        }

        // 2. Calculate Preview
        const calculation = await discountService.calculateFinalPrice(
            { subtotal: Number(subtotal), deliveryFee: Number(deliveryFee), items: items || [] },
            validation.discount
        );

        return res.status(200).json({
            success: true,
            data: calculation
        });

    } catch (error) {
        console.error("Discount Verify Error:", error);
        return res.status(500).json({ success: false, message: "Failed to verify discount" });
    }
};

/**
 * ➕ Create a new discount (Admin/Vendor)
 * @route POST /api/admin/discounts
 */
export const createDiscount = async (req, res) => {
    try {
        const {
            code,
            description,
            type,
            value,
            scope,
            vendorId,
            targetFoodIds,
            minOrderAmount,
            maxDiscountAmount,
            startDate,
            endDate,
            usageLimit,
            fundedBy
        } = req.body;

        const existing = await Discount.findOne({ code: code.toUpperCase() });
        if (existing) {
            return res.status(400).json({ success: false, message: "Discount code already exists" });
        }

        const discount = new Discount({
            code,
            description,
            type,
            value,
            scope,
            vendorId, // Optional, can be null for platform-wide
            targetFoodIds,
            minOrderAmount,
            maxDiscountAmount,
            startDate,
            endDate,
            usageLimit,
            fundedBy: fundedBy || "VENDOR"
        });

        await discount.save();

        // 🔄 SYNC: If food-specific discount, update Food model for frontend visibility
        if (targetFoodIds && Array.isArray(targetFoodIds) && targetFoodIds.length > 0) {
            await Food.updateMany(
                { _id: { $in: targetFoodIds } },
                { $addToSet: { activePromotions: discount._id } }
            );
        }

        return res.status(201).json({
            success: true,
            message: "Discount created successfully",
            data: discount
        });

    } catch (error) {
        console.error("Create Discount Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 📋 Get Discounts (Admin/Vendor)
 */
export const getDiscounts = async (req, res) => {
    try {
        const { vendorId } = req.query;
        const query = {};

        if (vendorId) {
            // Vendors only see their own OR platform promos applicable to them
            query.$or = [
                { vendorId: vendorId },
                { scope: "GLOBAL_ORDER" },
                { scope: "DELIVERY_FEE" }
            ];
        }

        const discounts = await Discount.find(query).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: discounts
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}
