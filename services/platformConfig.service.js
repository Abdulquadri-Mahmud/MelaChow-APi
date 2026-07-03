import PlatformConfig from "../model/platform/PlatformConfig.model.js";

/**
 * Fetch the singleton platform config.
 * Returns hardcoded defaults if no document exists yet (zero-config startup).
 * Defaults mirror current hardcoded values — zero behavioral change on first deploy.
 *
 * Performance note: this is a single indexed document lookup.
 * MongoDB keeps hot documents in memory. At MelaChow's launch scale,
 * this adds ~1ms per order. Add Redis caching when you're doing 100+ orders/min.
 */
export const getPlatformConfig = async () => {
  const config = await PlatformConfig.findOne({ type: "singleton" }).lean();

  if (!config) {
    return {
      riderFixedPayout: 600,
      riderAssignmentMode: "manual",
      riderTerminationPenaltyHours: 24,
      riderPayoutHour: 10,
      commissionEnabled: false,
      commissionRate: 0,
      serviceFeeEnabled: false,
      serviceFeeType: "fixed",
      serviceFeeValue: 0,
      serviceFeeCap: 500,
    };
  }

  return config;
};

/**
 * Calculate the service fee for an order given the platform config.
 * Free delivery promos only remove delivery fee. They do not remove service fee.
 *
 * Returns 0 if:
 *   - service fee is disabled
 *   - subtotal is 0 or negative
 *
 * @param {Object} config - Result of getPlatformConfig()
 * @param {Number} subtotal - Order food subtotal in naira
 * @returns {Number} Service fee in naira (2 decimal precision)
 */
export const calculateServiceFee = (config, subtotal) => {
  if (!config.serviceFeeEnabled) return 0;
  if (!subtotal || subtotal <= 0) return 0;

  let fee = 0;

  if (config.serviceFeeType === "fixed") {
    fee = config.serviceFeeValue;
  } else if (config.serviceFeeType === "percentage") {
    fee = (subtotal * config.serviceFeeValue) / 100;
    // Apply cap
    if (config.serviceFeeCap > 0) {
      fee = Math.min(fee, config.serviceFeeCap);
    }
  }

  return Number(Math.max(0, fee).toFixed(2));
};
