import crypto from "crypto";

export const hashPromoValue = (value) => {
  const cleaned = String(value || "").trim().toLowerCase();
  if (!cleaned) return null;
  return crypto.createHash("sha256").update(cleaned).digest("hex");
};

export const normalizePhoneForPromo = (phone) => {
  const cleaned = String(phone || "").replace(/[^\d+]/g, "");
  if (!cleaned) return "";

  if (cleaned.startsWith("+234")) return cleaned;
  if (cleaned.startsWith("234")) return `+${cleaned}`;
  if (cleaned.startsWith("0") && cleaned.length >= 11) {
    return `+234${cleaned.slice(1)}`;
  }

  return cleaned;
};

export const buildPromoIdentity = ({ deviceId, phone } = {}) => {
  const normalizedPhone = normalizePhoneForPromo(phone);

  return {
    hashedDeviceId: hashPromoValue(deviceId),
    phoneHash: hashPromoValue(normalizedPhone),
  };
};
