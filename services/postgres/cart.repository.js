import prisma from "../../config/prisma.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resolveId = async (model, id) => {
  if (!id) return null;
  if (uuidPattern.test(String(id))) return String(id);

  const record = await model.findUnique({
    where: { legacyMongoId: String(id) },
    select: { id: true },
  });

  return record?.id || null;
};

const legacyId = (record) => record?.legacyMongoId || record?.id || null;

const lineItemShape = (lineItem) => ({
  _id: legacyId(lineItem),
  id: lineItem.id,
  vendor_sub_cart_id: lineItem.vendorSubCart?.legacyMongoId || lineItem.vendorSubCartId,
  line_item_type: lineItem.lineItemType,
  menu_item_id: lineItem.menuItem?.legacyMongoId || lineItem.menuItemId,
  portion_id: lineItem.portion?.legacyMongoId || lineItem.portionId,
  selected_choices: lineItem.selectedChoices || [],
  unit_price: lineItem.unitPrice,
  variant_id: lineItem.comboItem?.legacyMongoId || lineItem.variantId,
  variant_choices: lineItem.variantChoices || [],
  base_price: lineItem.basePrice,
  choices_price: lineItem.choicesPrice,
  total_price: lineItem.totalPrice,
  quantity: lineItem.quantity,
  special_instructions: lineItem.specialInstructions,
  added_at: lineItem.addedAt,
  item_status_at_add: lineItem.itemStatusAtAdd,
  createdAt: lineItem.createdAt,
  updatedAt: lineItem.updatedAt,
});

const subCartShape = (subCart) => {
  const lineItems = subCart.lineItems || [];
  const subtotal = lineItems.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);

  return {
    _id: legacyId(subCart),
    id: subCart.id,
    cart_id: subCart.cart?.legacyMongoId || subCart.cartId,
    vendor_id: subCart.vendor?.legacyMongoId || subCart.vendorId,
    vendor_name: subCart.vendorName,
    createdAt: subCart.createdAt,
    updatedAt: subCart.updatedAt,
    line_items: lineItems.map(lineItemShape),
    sub_total: subtotal,
    flags: [],
  };
};

const cartInclude = {
  subCarts: {
    include: {
      vendor: { select: { id: true, legacyMongoId: true, storeName: true } },
      lineItems: {
        orderBy: { createdAt: "asc" },
        include: {
          vendorSubCart: { select: { id: true, legacyMongoId: true } },
          menuItem: { select: { id: true, legacyMongoId: true } },
          portion: { select: { id: true, legacyMongoId: true } },
          comboItem: { select: { id: true, legacyMongoId: true } },
        },
      },
    },
  },
};

const ensureActiveCart = async (tx, customerId) => {
  const existing = await tx.cart.findFirst({
    where: { customerId, status: "ACTIVE" },
    select: { id: true },
  });

  if (existing) return existing;

  return tx.cart.create({
    data: {
      customerId,
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    select: { id: true },
  });
};

const ensureVendorSubCart = async (tx, cartId, vendorId) => {
  const existing = await tx.vendorSubCart.findUnique({
    where: { cartId_vendorId: { cartId, vendorId } },
    select: { id: true },
  });

  if (existing) return existing;

  const vendor = await tx.vendor.findUnique({
    where: { id: vendorId },
    select: { storeName: true },
  });

  if (!vendor) throw new Error("Vendor not found");

  return tx.vendorSubCart.create({
    data: {
      cartId,
      vendorId,
      vendorName: vendor.storeName,
    },
    select: { id: true },
  });
};

const resolveChoiceSelections = async (tx, menuItemId, selectedChoices = []) => {
  const groups = await tx.menuItemChoiceGroup.findMany({
    where: { menuItemId },
    include: { options: { where: { isAvailable: true } } },
  });

  const groupMap = new Map(groups.map((group) => [group.id, group]));
  const optionMap = new Map();
  groups.forEach((group) => {
    group.options.forEach((option) => optionMap.set(option.id, { ...option, group }));
  });

  const resolvedChoices = [];
  let choicesPrice = 0;

  for (const selection of selectedChoices || []) {
    const groupId = await resolveId(tx.menuItemChoiceGroup, selection.group_id || selection.groupId);
    const group = groupId ? groupMap.get(groupId) : null;
    if (!group) throw new Error("Invalid choice group");

    const optionIds = selection.option_ids || selection.optionIds || [];
    if (!Array.isArray(optionIds)) throw new Error("Invalid choice options");

    const resolvedOptions = [];
    for (const optionInputId of optionIds) {
      const optionId = await resolveId(tx.menuItemChoiceOption, optionInputId);
      const option = optionId ? optionMap.get(optionId) : null;
      if (!option || option.groupId !== group.id) {
        throw new Error(`One or more choices for group ${group.name} are unavailable`);
      }

      choicesPrice += Number(option.priceModifier || 0);
      resolvedOptions.push({
        option_id: legacyId(option),
        label: option.label,
        price_modifier: option.priceModifier,
      });
    }

    resolvedChoices.push({
      group_id: legacyId(group),
      group_name: group.name,
      options: resolvedOptions,
    });
  }

  for (const group of groups) {
    if (!group.isRequired) continue;
    const hasSelection = resolvedChoices.some((choice) => String(choice.group_id) === String(legacyId(group)));
    if (!hasSelection) throw new Error(`${group.name} is required`);
  }

  return { resolvedChoices, choicesPrice };
};

const getCartRecord = async (customerId) =>
  prisma.cart.findFirst({
    where: { customerId, status: "ACTIVE" },
    include: cartInclude,
  });

const shapeCart = (cart) => {
  if (!cart) return null;

  const subCarts = (cart.subCarts || []).map(subCartShape);
  const subtotal = subCarts.reduce((sum, subCart) => sum + Number(subCart.sub_total || 0), 0);
  const totalItems = subCarts.reduce(
    (sum, subCart) =>
      sum + (subCart.line_items || []).reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0),
    0
  );

  return {
    cart_id: legacyId(cart),
    id: cart.id,
    status: cart.status,
    vendor_sub_carts: subCarts,
    cart_summary: {
      vendor_count: subCarts.length,
      total_items: totalItems,
      subtotal,
      note: "Prices in kobo. Divide by 100 for Naira display.",
    },
  };
};

export const postgresCartRepository = {
  async addPortionItem(userId, payload) {
    const customerId = await resolveId(prisma.user, userId);
    const vendorId = await resolveId(prisma.vendor, payload.vendor_id);
    const menuItemId = await resolveId(prisma.menuItem, payload.menu_item_id);
    const portionId = await resolveId(prisma.menuItemPortion, payload.portion_id);

    if (!customerId) throw new Error("User not found");
    if (!vendorId) throw new Error("Vendor not found");
    if (!menuItemId || !portionId) throw new Error("Item or Portion not found");

    return prisma.$transaction(async (tx) => {
      const cart = await ensureActiveCart(tx, customerId);
      const subCart = await ensureVendorSubCart(tx, cart.id, vendorId);

      const item = await tx.menuItem.findUnique({
        where: { id: menuItemId },
        select: {
          id: true,
          name: true,
          vendorId: true,
          isAvailable: true,
          isInStock: true,
          isArchived: true,
        },
      });
      const portion = await tx.menuItemPortion.findUnique({
        where: { id: portionId },
        select: {
          id: true,
          menuItemId: true,
          price: true,
          isAvailable: true,
          isInStock: true,
          maxQuantity: true,
        },
      });

      if (!item || !portion) throw new Error("Item or Portion not found");
      if (item.vendorId !== vendorId) throw new Error("Item does not belong to selected vendor");
      if (portion.menuItemId !== item.id) throw new Error("Invalid portion for item");
      if (!item.isAvailable || !item.isInStock || item.isArchived || !portion.isAvailable || !portion.isInStock) {
        throw new Error("Item or portion is currently unavailable");
      }

      const quantity = Number(payload.quantity || 1);
      if (quantity < 1) throw new Error("Quantity must be at least 1");
      if (portion.maxQuantity && quantity > portion.maxQuantity) {
        throw new Error(`Maximum ${portion.maxQuantity} portions of ${item.name} per order action.`);
      }

      const { resolvedChoices, choicesPrice } = await resolveChoiceSelections(
        tx,
        item.id,
        payload.selected_choices || []
      );
      const unitPrice = Number(portion.price || 0);
      const totalLinePrice = (unitPrice + choicesPrice) * quantity;

      const lineItem = await tx.cartLineItem.create({
        data: {
          vendorSubCartId: subCart.id,
          lineItemType: "PORTION_ITEM",
          menuItemId: item.id,
          portionId: portion.id,
          quantity,
          selectedChoices: resolvedChoices,
          unitPrice,
          choicesPrice,
          totalPrice: totalLinePrice,
          specialInstructions: payload.special_instructions || null,
          itemStatusAtAdd: "AVAILABLE",
        },
        include: {
          vendorSubCart: { select: { id: true, legacyMongoId: true } },
          menuItem: { select: { id: true, legacyMongoId: true } },
          portion: { select: { id: true, legacyMongoId: true } },
          comboItem: { select: { id: true, legacyMongoId: true } },
        },
      });

      return { lineItem: lineItemShape(lineItem), subCartId: subCart.id };
    });
  },

  async addVariantItem(userId, payload) {
    const customerId = await resolveId(prisma.user, userId);
    const vendorId = await resolveId(prisma.vendor, payload.vendor_id);
    const comboId = await resolveId(prisma.comboItem, payload.variant_id || payload.combo_id);

    if (!customerId) throw new Error("User not found");
    if (!vendorId) throw new Error("Vendor not found");
    if (!comboId) throw new Error("Variant is currently unavailable");

    return prisma.$transaction(async (tx) => {
      const cart = await ensureActiveCart(tx, customerId);
      const subCart = await ensureVendorSubCart(tx, cart.id, vendorId);
      const combo = await tx.comboItem.findUnique({
        where: { id: comboId },
        select: {
          id: true,
          vendorId: true,
          price: true,
          isAvailable: true,
          isInStock: true,
          isArchived: true,
        },
      });

      if (!combo || combo.vendorId !== vendorId || !combo.isAvailable || !combo.isInStock || combo.isArchived) {
        throw new Error("Variant is currently unavailable");
      }

      const quantity = Number(payload.quantity || 1);
      if (quantity < 1) throw new Error("Quantity must be at least 1");
      const variantChoices = payload.variant_choices || [];
      const choicesPrice = 0;
      const totalLinePrice = (Number(combo.price || 0) + choicesPrice) * quantity;

      const lineItem = await tx.cartLineItem.create({
        data: {
          vendorSubCartId: subCart.id,
          lineItemType: "VARIANT_ITEM",
          variantId: combo.id,
          quantity,
          variantChoices,
          basePrice: combo.price,
          choicesPrice,
          totalPrice: totalLinePrice,
          specialInstructions: payload.special_instructions || null,
          itemStatusAtAdd: "AVAILABLE",
        },
        include: {
          vendorSubCart: { select: { id: true, legacyMongoId: true } },
          menuItem: { select: { id: true, legacyMongoId: true } },
          portion: { select: { id: true, legacyMongoId: true } },
          comboItem: { select: { id: true, legacyMongoId: true } },
        },
      });

      return { lineItem: lineItemShape(lineItem), subCartId: subCart.id };
    });
  },

  async getCart(userId) {
    const customerId = await resolveId(prisma.user, userId);
    if (!customerId) return null;
    return shapeCart(await getCartRecord(customerId));
  },

  async removeCartItem(userId, lineItemId) {
    const customerId = await resolveId(prisma.user, userId);
    if (!customerId || !lineItemId) return { found: false };
    const lineItemKey = String(lineItemId);

    return prisma.$transaction(async (tx) => {
      const lineItem = uuidPattern.test(lineItemKey)
        ? await tx.cartLineItem.findUnique({
            where: { id: lineItemKey },
            include: { vendorSubCart: { include: { cart: true } } },
          })
        : await tx.cartLineItem.findFirst({
            where: { legacyMongoId: lineItemKey },
            include: { vendorSubCart: { include: { cart: true } } },
          });

      if (!lineItem) return { found: false };
      if (lineItem.vendorSubCart.cart.customerId !== customerId || lineItem.vendorSubCart.cart.status !== "ACTIVE") {
        return { unauthorized: true };
      }

      const subCartId = lineItem.vendorSubCartId;
      await tx.cartLineItem.delete({ where: { id: lineItem.id } });
      const remainingItems = await tx.cartLineItem.count({ where: { vendorSubCartId: subCartId } });
      if (remainingItems === 0) {
        await tx.vendorSubCart.delete({ where: { id: subCartId } });
      }

      return { removed: true };
    });
  },

  async removeVendorSubCart(userId, vendorIdInput) {
    const customerId = await resolveId(prisma.user, userId);
    const vendorId = await resolveId(prisma.vendor, vendorIdInput);
    if (!customerId) return { cartFound: false };
    if (!vendorId) return { subCartFound: false };

    return prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findFirst({
        where: { customerId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!cart) return { cartFound: false };

      const subCart = await tx.vendorSubCart.findUnique({
        where: { cartId_vendorId: { cartId: cart.id, vendorId } },
        select: { id: true },
      });
      if (!subCart) return { subCartFound: false };

      await tx.cartLineItem.deleteMany({ where: { vendorSubCartId: subCart.id } });
      await tx.vendorSubCart.delete({ where: { id: subCart.id } });

      return { removed: true };
    });
  },
};
