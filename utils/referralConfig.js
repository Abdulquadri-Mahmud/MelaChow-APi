export const DEFAULT_REFERRAL_CONFIG = Object.freeze({
  enabled: true,
  rewardMode: "one_sided", // "one_sided" | "two_sided"
  referrerRewardNaira: 100,
  refereeRewardNaira: 0,
  minOrderSubtotalNaira: 2500,
  creditSpendScope: "food_subtotal_only", // "food_subtotal_only"
  creditExpiryDays: 2,
  attributionExpiryDays: 2,
  issuanceTrigger: "on_delivered", // "on_delivered" | "on_completed"
  maxCreditPerOrderNaira: 0, // 0 = no per-order cap beyond food subtotal
  allowStackWithCoupons: false,
  allowStackWithFreeDelivery: true,
  maxRewardsPerUserPerMonth: 20,
  maxReferralsPerIp24h: 3,
  maxReferralsPerAddress: 2,
});

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function normalizeReferralConfig(raw = {}, existing = {}) {
  const base = existing && typeof existing === "object" ? existing : {};
  const input = raw && typeof raw === "object" ? raw : {};
  const merged = { ...DEFAULT_REFERRAL_CONFIG, ...base, ...input };

  const rewardMode = ["one_sided", "two_sided"].includes(merged.rewardMode)
    ? merged.rewardMode
    : DEFAULT_REFERRAL_CONFIG.rewardMode;

  const issuanceTrigger = ["on_delivered", "on_completed"].includes(merged.issuanceTrigger)
    ? merged.issuanceTrigger
    : DEFAULT_REFERRAL_CONFIG.issuanceTrigger;

  return {
    enabled: Boolean(merged.enabled),
    rewardMode,
    referrerRewardNaira: Math.round(clampNumber(merged.referrerRewardNaira, 0, 100000, DEFAULT_REFERRAL_CONFIG.referrerRewardNaira)),
    refereeRewardNaira:
      rewardMode === "two_sided"
        ? Math.round(clampNumber(merged.refereeRewardNaira, 0, 100000, 0))
        : 0,
    minOrderSubtotalNaira: Math.round(clampNumber(merged.minOrderSubtotalNaira, 0, 500000, DEFAULT_REFERRAL_CONFIG.minOrderSubtotalNaira)),
    creditSpendScope: "food_subtotal_only",
    creditExpiryDays: Math.round(clampNumber(merged.creditExpiryDays, 1, 365, DEFAULT_REFERRAL_CONFIG.creditExpiryDays)),
    attributionExpiryDays: Math.round(clampNumber(merged.attributionExpiryDays, 1, 365, DEFAULT_REFERRAL_CONFIG.attributionExpiryDays)),
    issuanceTrigger,
    maxCreditPerOrderNaira: Math.round(clampNumber(merged.maxCreditPerOrderNaira, 0, 500000, DEFAULT_REFERRAL_CONFIG.maxCreditPerOrderNaira)),
    allowStackWithCoupons: Boolean(merged.allowStackWithCoupons),
    allowStackWithFreeDelivery: merged.allowStackWithFreeDelivery !== false,
    maxRewardsPerUserPerMonth: Math.round(clampNumber(merged.maxRewardsPerUserPerMonth, 1, 1000, DEFAULT_REFERRAL_CONFIG.maxRewardsPerUserPerMonth)),
    maxReferralsPerIp24h: Math.round(clampNumber(merged.maxReferralsPerIp24h, 1, 100, DEFAULT_REFERRAL_CONFIG.maxReferralsPerIp24h)),
    maxReferralsPerAddress: Math.round(clampNumber(merged.maxReferralsPerAddress, 1, 100, DEFAULT_REFERRAL_CONFIG.maxReferralsPerAddress)),
  };
}

export function canonicalizeEmailForFraud(email) {
  const raw = String(email || "").trim().toLowerCase();
  if (!raw.includes("@")) return raw;
  const [localPart, domain] = raw.split("@");
  const normalizedDomain = domain === "googlemail.com" ? "gmail.com" : domain;
  const withoutPlus = localPart.split("+")[0];
  const normalizedLocal =
    normalizedDomain === "gmail.com" ? withoutPlus.replace(/\./g, "") : withoutPlus;
  return `${normalizedLocal}@${normalizedDomain}`;
}

export function normalizeAddressKeyForFraud(address) {
  if (!address) return "";
  if (typeof address === "string") {
    return address.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 120);
  }
  const lat = Number(address.latitude ?? address.coordinates?.lat);
  const lng = Number(address.longitude ?? address.coordinates?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    // ~50m geo bucket catches same-building duplicate accounts while staying privacy-safe when hashed
    return `geo:${lat.toFixed(4)},${lng.toFixed(4)}`;
  }
  const parts = [
    address.formattedAddress || address.street || address.addressLine || address.address || "",
    address.cityName || address.city || "",
    address.stateName || address.state || "",
  ]
    .join("|")
    .toLowerCase()
    .replace(/[^a-z0-9|]/g, "");
  return parts.slice(0, 160);
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excludes 0/O/1/I for readability

export function generateCandidateReferralCode(seedName = "") {
  const cleanPrefix = String(seedName || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4);
  const prefix = cleanPrefix.length >= 3 ? cleanPrefix : "CHOW";
  let suffix = "";
  for (let i = 0; i < 4; i += 1) {
    suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `${prefix}-${suffix}`;
}
