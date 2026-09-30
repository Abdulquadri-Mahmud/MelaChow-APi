export const koboToNaira = (value) => Number(value || 0) / 100;

export const orderItemToNaira = (item = {}) => {
  const metadata = item.metadata && typeof item.metadata === "object"
    ? {
        ...item.metadata,
        ...(item.metadata.pricing && typeof item.metadata.pricing === "object"
          ? {
              pricing: {
                ...item.metadata.pricing,
                ...(item.metadata.pricing.base_kobo != null ? { base_naira: koboToNaira(item.metadata.pricing.base_kobo) } : {}),
                ...(item.metadata.pricing.options_total_kobo != null ? { options_total_naira: koboToNaira(item.metadata.pricing.options_total_kobo) } : {}),
                ...(item.metadata.pricing.final_unit_kobo != null ? { final_unit_naira: koboToNaira(item.metadata.pricing.final_unit_kobo) } : {}),
              },
            }
          : {}),
      }
    : item.metadata;

  return {
    ...item,
    ...(item.price != null ? { price: koboToNaira(item.price) } : {}),
    ...(item.originalPrice != null ? { originalPrice: koboToNaira(item.originalPrice) } : {}),
    ...(item.vendorEarning != null ? { vendorEarning: koboToNaira(item.vendorEarning) } : {}),
    ...(item.variant && typeof item.variant === "object"
      ? { variant: { ...item.variant, ...(item.variant.price != null ? { price: koboToNaira(item.variant.price) } : {}) } }
      : {}),
    metadata,
  };
};
const moneyFieldPattern = /(amount|balance|subtotal|price|revenue|commission|fee|earning|payout|escrow|credit|debit|gmv|margin|spread|payment|payable|owed|obligation|sales|refund|gain)/i;
const nonMoneyFieldPattern = /(count|page|limit|rate|percent|percentage|distance|duration|hour|status|code|id)$/i;

const isNairaMoneyField = (key, parentKey) => {
  if (!key || /kobo$/i.test(key) || nonMoneyFieldPattern.test(key)) return false;
  if (key === "total") return parentKey !== "pagination";
  return moneyFieldPattern.test(key);
};

// PostgreSQL stores money as integer kobo. Admin finance responses are consumed
// by UI components that format values directly as naira, so conversion belongs
// at this repository/API boundary. Explicit *Kobo audit fields remain unchanged.
export const moneyResponseToNaira = (value, key = "", parentKey = "") => {
  if (Array.isArray(value)) return value.map((entry) => moneyResponseToNaira(entry, "", key));
  if (value instanceof Date || value == null) return value;
  if (typeof value === "bigint") return isNairaMoneyField(key, parentKey) ? Number(value) / 100 : Number(value);
  if (typeof value === "number") return isNairaMoneyField(key, parentKey) ? koboToNaira(value) : value;
  if (typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([field, fieldValue]) => [
      field,
      field === "moneyUnit" ? "naira" : moneyResponseToNaira(fieldValue, field, key),
    ])
  );
};