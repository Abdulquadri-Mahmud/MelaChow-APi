/**
 * ⛔ DEPRECATED — DO NOT USE
 *
 * This legacy payment controller is intentionally disabled.
 *
 * It contained critical vulnerabilities:
 *   - Hardcoded delivery fee (₦500) and platform commission (10%)
 *   - All wallet writes outside a MongoDB session (no atomicity)
 *   - No session/transaction — partial failures caused silent money loss
 *
 * The correct payment flow lives in:
 *   → controller/order/orderController.js  (initializePayment, verifyPaymentAndConfirmOrder)
 *   → controller/order/createOrderV2.controller.js  (updateOrderAfterPayment, createVendorOrdersAndUpdateWallets)
 *   → services/paymentHardening.service.js  (validateSuccessfulPaymentForOrder)
 *
 * All routes that previously pointed here must be updated to use the V2 order routes.
 */

export const verifyPayment = (_req, res) => {
    return res.status(410).json({
        success: false,
        message:
            "This endpoint is decommissioned. Use POST /api/orders/initialize-payment and POST /api/orders/verify-payment instead.",
    });
};