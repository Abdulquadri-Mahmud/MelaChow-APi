export const DEFAULT_RIDER_PAYOUT_CONFIG = Object.freeze({
  riderPayoutType: "flat",
  riderPayoutValue: 600,
  riderFixedPayout: 600,
});

export const normalizeRiderPayoutConfig = (config = {}) => {
  const riderPayoutType = config.riderPayoutType === "percentage" ? "percentage" : "flat";
  const fallback = DEFAULT_RIDER_PAYOUT_CONFIG.riderPayoutValue;
  const rawValue = config.riderPayoutValue ?? config.riderFixedPayout ?? fallback;
  const numericValue = Number(rawValue);
  const riderPayoutValue = Number.isFinite(numericValue) ? Math.max(0, numericValue) : fallback;

  return {
    riderPayoutType,
    riderPayoutValue: riderPayoutType === "percentage" ? Math.min(100, riderPayoutValue) : riderPayoutValue,
  };
};

// PostgreSQL monetary columns are kobo; admin configuration is entered in naira
// for flat payouts and as a whole-number percentage for percentage payouts.
export const calculateRiderPayoutKobo = (deliveryFeeKobo, config = {}) => {
  const fee = Math.max(0, Math.round(Number(deliveryFeeKobo) || 0));
  if (fee === 0) return 0;

  const { riderPayoutType, riderPayoutValue } = normalizeRiderPayoutConfig(config);
  const configuredPayout = riderPayoutType === "percentage"
    ? Math.round((fee * riderPayoutValue) / 100)
    : Math.round(riderPayoutValue * 100);

  return Math.min(fee, configuredPayout);
};

export const calculateRiderPayoutNaira = (deliveryFeeKobo, config = {}) =>
  calculateRiderPayoutKobo(deliveryFeeKobo, config) / 100;

export const describeRiderPayout = (config = {}) => {
  const { riderPayoutType, riderPayoutValue } = normalizeRiderPayoutConfig(config);
  return riderPayoutType === "percentage"
    ? `${riderPayoutValue}% of collected delivery fee`
    : `₦${riderPayoutValue} flat per platform delivery`;
};
