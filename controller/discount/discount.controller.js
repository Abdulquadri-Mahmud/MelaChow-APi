import Discount from "../../model/discount/Discount.js";
import discountService from "../../services/discount.service.js";
import Food from "../../model/vendor/food.model.js";

const VALID_TYPES = ["PERCENTAGE", "FIXED"];
const VALID_SCOPES = ["GLOBAL_ORDER", "VENDOR_ORDER", "SPECIFIC_ITEMS", "DELIVERY_FEE"];
const VALID_FUNDERS = ["PLATFORM", "VENDOR"];

const normalizeDiscountPayload = (body = {}, existing = {}) => {
    const type = body.type || body.discountType || existing.type;
    const scope = body.scope || existing.scope || "GLOBAL_ORDER";
    const endDate = body.endDate ?? body.expiresAt ?? existing.endDate;
    const targetFoodIds = scope === "SPECIFIC_ITEMS"
        ? (body.targetFoodIds ?? existing.targetFoodIds ?? [])
        : [];
    const minOrderAmount = body.minOrderAmount ?? existing.minOrderAmount ?? 0;
    const maxDiscountAmount = body.maxDiscountAmount ?? existing.maxDiscountAmount ?? null;
    const usageLimit = body.usageLimit ?? existing.usageLimit ?? null;
    const userUsageLimit = body.userUsageLimit ?? existing.userUsageLimit ?? 1;
    const fundedBy = body.fundedBy || existing.fundedBy || (scope === "GLOBAL_ORDER" || scope === "DELIVERY_FEE" ? "PLATFORM" : "VENDOR");

    return {
        code: body.code ?? existing.code,
        description: body.description ?? existing.description,
        type,
        value: body.value !== undefined ? Number(body.value) : existing.value,
        scope,
        vendorId: ["VENDOR_ORDER", "SPECIFIC_ITEMS"].includes(scope)
            ? (body.vendorId ?? existing.vendorId ?? null)
            : null,
        targetFoodIds,
        minOrderAmount: Number(minOrderAmount || 0),
        maxDiscountAmount: maxDiscountAmount === "" || maxDiscountAmount === null ? null : Number(maxDiscountAmount),
        startDate: body.startDate ?? existing.startDate ?? new Date(),
        endDate: endDate || null,
        usageLimit: usageLimit === "" || usageLimit === null ? null : Number(usageLimit),
        userUsageLimit: userUsageLimit === "" || userUsageLimit === null ? null : Number(userUsageLimit),
        fundedBy,
        isActive: body.isActive ?? existing.isActive ?? true,
    };
};

const validateDiscountPayload = (payload, { partial = false } = {}) => {
    if (!partial && !payload.code) return "Coupon code is required";
    if (!partial && !payload.description) return "Description is required";
    if (!partial && !payload.type) return "Discount type is required";
    if (!partial && (payload.value === undefined || Number.isNaN(payload.value))) return "Discount value is required";
    if (payload.type && !VALID_TYPES.includes(payload.type)) return "Invalid discount type";
    if (payload.scope && !VALID_SCOPES.includes(payload.scope)) return "Invalid discount scope";
    if (payload.fundedBy && !VALID_FUNDERS.includes(payload.fundedBy)) return "Invalid funding source";
    if (payload.value !== undefined && Number(payload.value) <= 0) return "Discount value must be greater than zero";
    if (payload.type === "PERCENTAGE" && Number(payload.value) > 100) return "Percentage discounts cannot exceed 100%";
    if (payload.scope === "VENDOR_ORDER" && !payload.vendorId) return "Vendor is required for vendor order coupons";
    if (payload.scope === "SPECIFIC_ITEMS") {
        if (!payload.vendorId) return "Vendor is required for item-specific coupons";
        if (!Array.isArray(payload.targetFoodIds) || payload.targetFoodIds.length === 0) {
            return "At least one target food item is required";
        }
    }
    if (payload.minOrderAmount < 0) return "Minimum order amount cannot be negative";
    if (payload.maxDiscountAmount !== null && payload.maxDiscountAmount < 0) return "Maximum discount cannot be negative";
    if (payload.usageLimit !== null && payload.usageLimit < 1) return "Usage limit must be at least 1";
    if (payload.userUsageLimit !== null && payload.userUsageLimit < 1) return "Per-user limit must be at least 1";
    return null;
};

const syncFoodPromotions = async (discountId, oldFoodIds = [], newFoodIds = []) => {
    const oldIds = oldFoodIds.map(String);
    const newIds = newFoodIds.map(String);
    const removedIds = oldIds.filter(id => !newIds.includes(id));

    if (removedIds.length > 0) {
        await Food.updateMany(
            { _id: { $in: removedIds } },
            { $pull: { activePromotions: discountId } }
        );
    }

    if (newIds.length > 0) {
        await Food.updateMany(
            { _id: { $in: newIds } },
            { $addToSet: { activePromotions: discountId } }
        );
    }
};

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
            data: calculation,
            ...calculation,
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
        const payload = normalizeDiscountPayload(req.body);
        const validationError = validateDiscountPayload(payload);
        if (validationError) {
            return res.status(400).json({ success: false, message: validationError });
        }

        const existing = await Discount.findOne({ code: payload.code.toUpperCase() });
        if (existing) {
            return res.status(400).json({ success: false, message: "Discount code already exists" });
        }

        const discount = new Discount(payload);

        await discount.save();

        await syncFoodPromotions(discount._id, [], discount.targetFoodIds || []);

        return res.status(201).json({
            success: true,
            message: "Discount created successfully",
            data: discount,
            discount,
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
            data: discounts,
            discounts,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const updateDiscount = async (req, res) => {
    try {
        const { id } = req.params;
        const discount = await Discount.findById(id);
        if (!discount) {
            return res.status(404).json({ success: false, message: "Discount not found" });
        }

        const oldFoodIds = discount.targetFoodIds || [];
        const payload = normalizeDiscountPayload(req.body, discount.toObject());
        const validationError = validateDiscountPayload(payload);
        if (validationError) {
            return res.status(400).json({ success: false, message: validationError });
        }

        if (payload.code && payload.code.toUpperCase() !== discount.code) {
            const existing = await Discount.findOne({ code: payload.code.toUpperCase(), _id: { $ne: id } });
            if (existing) {
                return res.status(400).json({ success: false, message: "Discount code already exists" });
            }
        }

        Object.assign(discount, payload);
        await discount.save();
        await syncFoodPromotions(discount._id, oldFoodIds, discount.targetFoodIds || []);

        return res.status(200).json({
            success: true,
            message: "Discount updated successfully",
            data: discount,
            discount,
        });
    } catch (error) {
        console.error("Update Discount Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const activateDiscount = async (req, res) => {
    try {
        const discount = await Discount.findByIdAndUpdate(
            req.params.id,
            { isActive: true },
            { new: true }
        );
        if (!discount) return res.status(404).json({ success: false, message: "Discount not found" });

        return res.status(200).json({ success: true, message: "Discount activated", data: discount, discount });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deactivateDiscount = async (req, res) => {
    try {
        const discount = await Discount.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );
        if (!discount) return res.status(404).json({ success: false, message: "Discount not found" });

        return res.status(200).json({ success: true, message: "Discount deactivated", data: discount, discount });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteDiscount = async (req, res) => {
    try {
        const discount = await Discount.findByIdAndDelete(req.params.id);
        if (!discount) return res.status(404).json({ success: false, message: "Discount not found" });

        await syncFoodPromotions(discount._id, discount.targetFoodIds || [], []);

        return res.status(200).json({ success: true, message: "Discount deleted" });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
