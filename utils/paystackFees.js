// utils/paystackFees.js
// MelaChow NGN transfer fee tiers.
// Update this file when Paystack changes their fee structure.

/**
 * Calculate the Paystack transfer fee for a given NGN amount.
 * Riders receive their full amount; the platform absorbs rider transfer fees.
 * Vendors absorb their own transfer fee (per agreement).
 *
 * @param {number} amount - Gross transfer amount in NGN
 * @returns {number} Fee in NGN
 */
export function calculatePaystackTransferFee(amount) {
    if (typeof amount !== "number" || amount < 0) {
        throw new TypeError(`calculatePaystackTransferFee expects a non-negative number, got: ${amount}`);
    }
    if (amount < 5000) return 100;
    if (amount < 10000) return 200;
    return 300;
}

/**
 * Calculate vendor net payout after Paystack fee deduction.
 * Vendors absorb their own transfer fee (disclosed in vendor agreement).
 *
 * @param {number} grossAmount - Vendor gross earnings for the period
 * @returns {{ net: number, fee: number }}
 */
export function calcVendorNetPayout(grossAmount) {
    const fee = calculatePaystackTransferFee(grossAmount);
    return {
        net: Number((grossAmount - fee).toFixed(2)),
        fee,
    };
}
