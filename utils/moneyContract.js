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