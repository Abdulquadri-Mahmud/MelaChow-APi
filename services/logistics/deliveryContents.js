export function deliveryContentsFrom(vendorOrder) {
  const sourceItems = Array.isArray(vendorOrder.items) ? vendorOrder.items : [];
  if (sourceItems.length > 100) throw new Error("Samka delivery supports at most 100 item lines");
  return {
    pickupBusinessName: String(vendorOrder.restaurant?.storeName || "").trim().slice(0, 200) || null,
    items: sourceItems.map((item) => {
      const name = String(item.name || item.foodId?.name || item.variant?.name || "Order item").trim().slice(0, 200);
      const quantity = Number(item.quantity ?? 1);
      if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Delivery item quantity must be a positive integer");
      const portion = item.portion_label || item.portionLabel;
      const portionQuantity = Number(item.portion_quantity ?? item.portionQuantity ?? 1);
      const variantName = item.variant?.name;
      const description = [
        portion ? `Size: ${portion}${portionQuantity > 1 ? ` ×${portionQuantity}` : ""}` : null,
        variantName && variantName !== name ? variantName : null,
      ].filter(Boolean).join(" · ").slice(0, 500) || null;
      return { name: name || "Order item", quantity, description };
    }),
  };
}