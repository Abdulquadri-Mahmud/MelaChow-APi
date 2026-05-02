import Discount from "../model/discount/Discount.js";
import Order from "../model/order/Order.js";
import { getPlatformConfig } from "./platformConfig.service.js";

/**
 * 🛡️ Service to handle all Discount Logic
 * Ensures security, validation, and consistent calculation.
 */
class DiscountService {

    /**
     * Validates a discount code against an order context
     * @param {string} code - The discount code
     * @param {Object} context - Order context { userId, vendorId, subtotal, items }
     * @returns {Object} - { valid: boolean, discount: Object, error: string }
     */
    async validateDiscount(code, context) {
        try {
            const discount = await Discount.findOne({
                code: code.toUpperCase(),
                isActive: true
            });

            if (!discount) {
                return { valid: false, error: "Invalid discount code" };
            }

            // 1. 📅 Date Validation
            const now = new Date();
            if (new Date(discount.startDate) > now) {
                return { valid: false, error: "Discount is not active yet" };
            }
            if (discount.endDate && new Date(discount.endDate) < now) {
                return { valid: false, error: "Discount has expired" };
            }

            // 2. 🔢 Global Usage Limits
            if (discount.usageLimit !== null && discount.usageCount >= discount.usageLimit) {
                return { valid: false, error: "Discount usage limit reached" };
            }

            // 3. 👤 User Usage Limits
            if (context.userId && discount.userUsageLimit !== null) {
                const userUsageCount = await Order.countDocuments({
                    userId: context.userId,
                    "appliedDiscount.code": discount.code,
                    orderStatus: { $ne: "cancelled" },
                });

                if (userUsageCount >= discount.userUsageLimit) {
                    return {
                        valid: false,
                        error: `You have already used this discount ${discount.userUsageLimit} time${discount.userUsageLimit === 1 ? "" : "s"}`
                    };
                }
            }

            // 4. 🏪 Vendor Scope Validation
            if (discount.scope === "VENDOR_ORDER" || discount.scope === "SPECIFIC_ITEMS") {
                if (!discount.vendorId) {
                    // Data integrity error, but let's handle it
                    return { valid: false, error: "Configuration error: Vendor discount has no vendor" };
                }
                if (context.vendorId && discount.vendorId.toString() !== context.vendorId.toString()) {
                    return { valid: false, error: "This discount is not valid for this vendor" };
                }
            }

            // 5. 💰 Minimum Order Amount
            if (context.subtotal < discount.minOrderAmount) {
                return { valid: false, error: `Minimum order of ₦${discount.minOrderAmount} required` };
            }

            // 6. 🍔 Item Specific Checks
            if (discount.scope === "SPECIFIC_ITEMS") {
                const hasTargetItem = context.items.some(item =>
                    item.foodId && discount.targetFoodIds.some(targetId => targetId.toString() === item.foodId.toString())
                );
                if (!hasTargetItem) {
                    return { valid: false, error: "Discount does not apply to any items in your cart" };
                }
            }

            return { valid: true, discount };

        } catch (error) {
            console.error("Discount Validation Error", error);
            return { valid: false, error: "Internal validation error" };
        }
    }

    /**
     * Calculates the final order pricing
     * Is idempotent and safe.
     * @param {Object} cart - { subtotal, deliveryFee, items: [{foodId, price, quantity}] }
     * @param {Object} discount - Validated discount object
     * @returns {Object} - { total, discountAmount, finalSubtotal, finalDeliveryFee, serviceFee }
     */
    async calculateFinalPrice(cart, discount) {
        let { subtotal, deliveryFee, items } = cart;
        const platformConfig = await getPlatformConfig();
        let discountAmount = 0;

        // Safety check
        if (!subtotal) subtotal = 0;
        if (!deliveryFee) deliveryFee = 0;

        if (!discount) {
            return {
                subtotal,
                deliveryFee,
                discountAmount: 0,
                total: subtotal + deliveryFee,
                breakdown: []
            };
        }

        // --- LOGIC BY SCOPE ---

        // A. Delivery Fee Discount
        if (discount.scope === "DELIVERY_FEE") {
            if (discount.type === "FIXED") {
                discountAmount = discount.value;
            } else {
                discountAmount = deliveryFee * (discount.value / 100);
            }
            // Cap at delivery fee amount (can't be negative)
            if (discountAmount > deliveryFee) discountAmount = deliveryFee;
        }

        // B. Global or Vendor Order Discount (Subtotal)
        else if (discount.scope === "GLOBAL_ORDER" || discount.scope === "VENDOR_ORDER") {
            if (discount.type === "FIXED") {
                discountAmount = discount.value;
            } else {
                discountAmount = subtotal * (discount.value / 100);
            }

            // Apply Max Limit for Percentage
            if (discount.type === "PERCENTAGE" && discount.maxDiscountAmount) {
                if (discountAmount > discount.maxDiscountAmount) {
                    discountAmount = discount.maxDiscountAmount;
                }
            }

            // Cap at subtotal
            if (discountAmount > subtotal) discountAmount = subtotal;
        }

        // C. Specific Items Discount
        else if (discount.scope === "SPECIFIC_ITEMS") {
            // Calculate discount for EACH matching item
            items.forEach(item => {
                if (item.foodId && discount.targetFoodIds.some(id => id.toString() === item.foodId.toString())) {
                    let itemDiscount = 0;
                    const itemTotal = item.price * item.quantity;

                    if (discount.type === "FIXED") {
                        // Fixed amount per item unit? Or per line item?
                        // Convention: Fixed amount usually means "₦500 off this item type".
                        // So ₦500 * quantity
                        itemDiscount = discount.value * item.quantity;
                    } else {
                        itemDiscount = itemTotal * (discount.value / 100);
                    }

                    discountAmount += itemDiscount;
                }
            });

            // Apply Max Limit globally for the discount code if strictly required, 
            // but usually max limit is per usage. Let's apply max limit to total discount.
            if (discount.type === "PERCENTAGE" && discount.maxDiscountAmount) {
                if (discountAmount > discount.maxDiscountAmount) {
                    discountAmount = discount.maxDiscountAmount;
                }
            }

            // Cap at subtotal (safety)
            if (discountAmount > subtotal) discountAmount = subtotal;
        }

        // Final Math
        // Ensure Integers or 2 decimals
        discountAmount = Math.floor(discountAmount); // Round down discount? Or round nearest. Let's floor to be safe on platform side.

        let finalSubtotal = subtotal;
        let finalDeliveryFee = deliveryFee;

        if (discount.scope === "DELIVERY_FEE") {
            finalDeliveryFee = Math.max(0, deliveryFee - discountAmount);
        } else {
            finalSubtotal = Math.max(0, subtotal - discountAmount);
        }

        // Service Fee logic
        // Skip if delivery promo is active (scope === "DELIVERY_FEE")
        let serviceFee = 0;
        if (platformConfig.serviceFeeEnabled && discount?.scope !== "DELIVERY_FEE") {
            if (platformConfig.serviceFeeType === 'fixed') {
                serviceFee = platformConfig.serviceFeeValue;
            } else {
                serviceFee = Number((subtotal * platformConfig.serviceFeeValue / 100).toFixed(2));
                if (platformConfig.serviceFeeCap && serviceFee > platformConfig.serviceFeeCap) {
                    serviceFee = platformConfig.serviceFeeCap;
                }
            }
        }

        const total = Number((finalSubtotal + finalDeliveryFee + serviceFee).toFixed(2));

        return {
            subtotal, // Original subtotal
            deliveryFee, // Original delivery fee
            serviceFee,
            discountAmount,
            finalSubtotal,
            finalDeliveryFee,
            total,
            appliedDiscount: {
                code: discount.code,
                type: discount.type,
                amount: discountAmount,
                scope: discount.scope,
                label: discount.description || discount.code,
                fundedBy: discount.fundedBy,
            }
        };
    }
}

export default new DiscountService();
