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
    const transferFee = amount <= 5000 ? 10 : amount <= 50000 ? 25 : 50;
    const stampDuty = amount >= 10000 ? 50 : 0;
    return transferFee + stampDuty;
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

/**
 * Resolves the effective fee configuration for a vendor or rider.
 * Default for rider: feeBearer = "platform", markupAmount = 0.
 * Default for vendor: feeBearer = "vendor", markupAmount = 0.
 *
 * Gating rule: Overrides ONLY take effect if override.status === "active".
 * Rider overrides with status "pending_notice" are ignored and revert to default.
 *
 * @param {"vendor" | "rider"} actorType
 * @param {Object} actor - Vendor or Rider Mongoose doc / object
 * @param {Object} [platformConfig] - Optional platform config object
 * @returns {{ feeBearer: "platform" | "vendor" | "rider", markupAmount: number }}
 */
export function getEffectiveFeeConfig(actorType, actor, platformConfig = {}) {
    const defaultFeeBearer = actorType === "rider" ? "platform" : "vendor";
    const override = actor?.payoutFeeOverride;

    if (override && override.status === "active") {
        return {
            feeBearer: override.feeBearer || defaultFeeBearer,
            markupAmount: typeof override.markupAmount === "number" ? override.markupAmount : 0,
        };
    }

    return {
        feeBearer: defaultFeeBearer,
        markupAmount: 0,
    };
}

/**
 * Computes actor payout net amount, transfer fee charged to actor, and markup charged to actor.
 *
 * @param {"vendor" | "rider"} actorType
 * @param {number} grossAmount - Amount requested / gross payout
 * @param {{ feeBearer: string, markupAmount: number }} effectiveConfig
 * @returns {{ feeChargedToActor: number, markupChargedToActor: number, net: number }}
 */
export function computeActorPayout(actorType, grossAmount, effectiveConfig) {
    const paystackFee = calculatePaystackTransferFee(grossAmount);
    const feeChargedToActor = (effectiveConfig.feeBearer === actorType) ? paystackFee : 0;
    const markupChargedToActor = effectiveConfig.markupAmount || 0;
    const net = Number((grossAmount - feeChargedToActor - markupChargedToActor).toFixed(2));

    return {
        feeChargedToActor,
        markupChargedToActor,
        net,
    };
}
