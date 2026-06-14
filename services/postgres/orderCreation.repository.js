import crypto from "crypto";
import prisma from "../../config/prisma.js";
import { assertVendorIsOpen } from "../../utils/vendorOpenStatus.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const defaultPlatformConfig = {
  commissionEnabled: false,
  commissionRate: 0,
  serviceFeeEnabled: false,
  serviceFeeType: "fixed",
  serviceFeeValue: 0,
  serviceFeeCap: 500,
};

const legacyId = (record) => record?.legacyMongoId || record?.id || null;

const generateOrderCode = () => `ORD-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;

const resolveId = async (model, id) => {
  if (!id) return null;
  if (uuidPattern.test(String(id))) return String(id);

  const record = await model.findUnique({
    where: { legacyMongoId: String(id) },
    select: { id: true },
  });

  return record?.id || null;
};

const normalizeAddress = (deliveryAddress = {}) => ({
  ...deliveryAddress,
  city: deliveryAddress.cityName || deliveryAddress.city || "",
  state: deliveryAddress.stateName || deliveryAddress.state || "",
});

const platformConfigValue = async (tx) => {
  const config = await tx.platformConfig.findUnique({
    where: { type: "singleton" },
    select: { value: true },
  });

  return {
    ...defaultPlatformConfig,
    ...(config?.value && typeof config.value === "object" && !Array.isArray(config.value) ? config.value : {}),
  };
};

const calculateServiceFee = (config, subtotal) => {
  if (!config.serviceFeeEnabled || !subtotal || subtotal <= 0) return 0;

  if (config.serviceFeeType === "fixed") {
    return Math.max(0, Number(config.serviceFeeValue || 0));
  }

  if (config.serviceFeeType === "percentage") {
    const rawFee = (subtotal * Number(config.serviceFeeValue || 0)) / 100;
    const cappedFee = config.serviceFeeCap > 0 ? Math.min(rawFee, Number(config.serviceFeeCap)) : rawFee;
    return Math.max(0, Math.round(cappedFee));
  }

  return 0;
};

const resolveVendorDeliveryFee = async (tx, vendor) => {
  if (vendor.platformDeliveryFeeOverride != null && vendor.platformDeliveryFeeOverride > 0) {
    return vendor.platformDeliveryFeeOverride;
  }

  if (vendor.city?.platformDeliveryFee != null) {
    return vendor.city.platformDeliveryFee;
  }

  const cityName = vendor.address?.city;
  if (!cityName) {
    throw new Error(`Vendor "${vendor.storeName}" has no city set for delivery fee resolution.`);
  }

  const city = await tx.city.findFirst({
    where: { name: { equals: cityName, mode: "insensitive" } },
    select: { platformDeliveryFee: true },
  });

  if (!city) {
    throw new Error(`No platform delivery fee configured for city "${cityName}".`);
  }

  return city.platformDeliveryFee || 0;
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

    for (const optionInputId of optionIds) {
      const optionId = await resolveId(tx.menuItemChoiceOption, optionInputId);
      const option = optionId ? optionMap.get(optionId) : null;
      if (!option || option.groupId !== group.id) {
        throw new Error(`One or more choices for group ${group.name} are unavailable`);
      }

      choicesPrice += Number(option.priceModifier || 0);
      resolvedChoices.push({
        group_id: legacyId(group),
        group_name: group.name,
        option_id: legacyId(option),
        label: option.label,
        price_modifier_naira: option.priceModifier,
        quantity: 1,
      });
    }
  }

  for (const group of groups) {
    if (!group.isRequired) continue;
    const hasSelection = resolvedChoices.some((choice) => String(choice.group_id) === String(legacyId(group)));
    if (!hasSelection) throw new Error(`${group.name} is required`);
  }

  return { selectedOptions: resolvedChoices, choicesPrice };
};

const normalizeOrderItems = async (tx, items) => {
  const normalizedItems = [];
  const vendorItemsMap = new Map();

  for (let index = 0; index < items.length; index += 1) {
    const cartItem = items[index];
    const vendorId = await resolveId(tx.vendor, cartItem.restaurantId);
    if (!vendorId) throw new Error(`Item ${index}: restaurantId is invalid`);

    const quantity = Number(cartItem.quantity || 1);
    if (quantity < 1) throw new Error(`Item ${index}: quantity must be at least 1`);

    const isCombo =
      cartItem.type === "combo" ||
      (!cartItem.type && (cartItem.comboId || cartItem.variantId) && !cartItem.foodId);

    let normalizedItem;

    if (isCombo) {
      const comboId = await resolveId(tx.comboItem, cartItem.comboId || cartItem.variantId);
      if (!comboId) throw new Error(`Item ${index}: comboId is invalid`);

      const combo = await tx.comboItem.findUnique({
        where: { id: comboId },
        select: {
          id: true,
          legacyMongoId: true,
          vendorId: true,
          name: true,
          imageUrl: true,
          price: true,
          dietaryType: true,
          isAvailable: true,
          isInStock: true,
          isArchived: true,
        },
      });

      if (!combo) throw new Error(`Item ${index}: Combo not found`);
      if (combo.vendorId !== vendorId) throw new Error(`Item ${index}: Combo does not belong to this restaurant`);
      if (!combo.isAvailable || !combo.isInStock || combo.isArchived) {
        throw new Error(`Item ${index}: Combo is currently unavailable`);
      }

      normalizedItem = {
        type: "combo",
        foodId: null,
        portionId: null,
        variantId: combo.id,
        restaurantId: vendorId,
        storeName: cartItem.storeName || "",
        variant: { name: combo.name, price: combo.price, image: combo.imageUrl || "" },
        name: combo.name,
        imageUrl: combo.imageUrl || "",
        portionLabel: "",
        quantity,
        portionQuantity: 1,
        price: combo.price,
        note: cartItem.note || "",
        dietaryType: combo.dietaryType,
        itemType: "combo",
        selectedOptions: cartItem.selected_options || [],
        metadata: {
          type: "combo",
          selected_options: cartItem.selected_options || [],
          pricing: { base_kobo: combo.price, final_unit_kobo: combo.price },
        },
      };
    } else {
      const menuItemId = await resolveId(tx.menuItem, cartItem.foodId);
      const portionId = await resolveId(tx.menuItemPortion, cartItem.portionId);
      if (!menuItemId) throw new Error(`Item ${index}: foodId is invalid`);
      if (!portionId) throw new Error(`Item ${index}: portionId is invalid`);

      const menuItem = await tx.menuItem.findUnique({
        where: { id: menuItemId },
        select: {
          id: true,
          legacyMongoId: true,
          vendorId: true,
          name: true,
          imageUrl: true,
          dietaryType: true,
          itemType: true,
          isAvailable: true,
          isInStock: true,
          isArchived: true,
        },
      });
      const portion = await tx.menuItemPortion.findUnique({
        where: { id: portionId },
        select: {
          id: true,
          legacyMongoId: true,
          menuItemId: true,
          label: true,
          price: true,
          isAvailable: true,
          isInStock: true,
          maxQuantity: true,
        },
      });

      if (!menuItem || !portion) throw new Error(`Item ${index}: Food or portion not found`);
      if (menuItem.vendorId !== vendorId) throw new Error(`Item ${index}: Food does not belong to this restaurant`);
      if (portion.menuItemId !== menuItem.id) throw new Error(`Item ${index}: Invalid portion for food`);
      if (!menuItem.isAvailable || !menuItem.isInStock || menuItem.isArchived || !portion.isAvailable || !portion.isInStock) {
        throw new Error(`Item ${index}: Food or portion is currently unavailable`);
      }
      if (portion.maxQuantity && quantity > portion.maxQuantity) {
        throw new Error(`Item ${index}: Maximum ${portion.maxQuantity} portions allowed`);
      }

      const { selectedOptions, choicesPrice } = await resolveChoiceSelections(
        tx,
        menuItem.id,
        cartItem.selected_choices || cartItem.selectedOptions || []
      );
      const portionQuantity = Number(cartItem.portion_quantity || cartItem.portionQuantity || 1);
      const unitPrice = portion.price * portionQuantity + choicesPrice;

      normalizedItem = {
        type: "item",
        foodId: menuItem.id,
        portionId: portion.id,
        variantId: null,
        restaurantId: vendorId,
        storeName: cartItem.storeName || "",
        variant: { name: portion.label, price: unitPrice, image: menuItem.imageUrl || "" },
        name: menuItem.name,
        imageUrl: menuItem.imageUrl || "",
        portionLabel: portion.label,
        quantity,
        portionQuantity,
        price: unitPrice,
        note: cartItem.note || "",
        dietaryType: menuItem.dietaryType,
        itemType: menuItem.itemType,
        selectedOptions,
        metadata: {
          type: "item",
          portionId: legacyId(portion),
          portion_label: portion.label,
          selected_options: selectedOptions,
          dietary_type: menuItem.dietaryType,
          item_type: menuItem.itemType,
          pricing: {
            base_kobo: portion.price * portionQuantity,
            options_total_kobo: choicesPrice,
            final_unit_kobo: unitPrice,
          },
        },
      };
    }

    normalizedItems.push(normalizedItem);
    if (!vendorItemsMap.has(vendorId)) vendorItemsMap.set(vendorId, []);
    vendorItemsMap.get(vendorId).push(normalizedItem);
  }

  return { normalizedItems, vendorItemsMap };
};

const orderShape = (order) => ({
  _id: legacyId(order),
  id: order.id,
  orderId: order.orderCode,
  orderCode: order.orderCode,
  userId: order.user?.legacyMongoId || order.userId,
  items: (order.items || []).map((item) => ({
    _id: legacyId(item),
    type: item.type,
    foodId: item.menuItem?.legacyMongoId || item.foodId,
    portionId: item.portion?.legacyMongoId || item.portionId,
    variantId: item.comboItem?.legacyMongoId || item.variantId,
    restaurantId: item.restaurant?.legacyMongoId || item.restaurantId,
    storeName: item.storeName,
    variant: item.variant,
    name: item.name,
    image_url: item.imageUrl,
    portion_label: item.portionLabel,
    quantity: item.quantity,
    portion_quantity: item.portionQuantity,
    price: item.price,
    note: item.note,
    dietary_type: item.dietaryType,
    item_type: item.itemType,
    selected_options: item.selectedOptions || [],
    metadata: item.metadata || {},
  })),
  vendorDeliveryFees: (order.vendorDeliveryFees || []).map((fee) => ({
    restaurantId: fee.restaurant?.legacyMongoId || fee.restaurantId,
    deliveryFee: fee.deliveryFee,
  })),
  deliveryAddress: order.deliveryAddress,
  phone: order.phone,
  subtotal: order.subtotal,
  deliveryFee: order.deliveryFee,
  serviceFee: order.serviceFee,
  total: order.total,
  appliedDiscount: order.appliedDiscount,
  paymentReference: order.paymentReference,
  paymentStatus: order.paymentStatus,
  orderStatus: order.orderStatus,
  freeDeliveryPromo: order.freeDeliveryPromo,
  vendorDeliveryPromo: order.vendorDeliveryPromo,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});

export const postgresOrderCreationRepository = {
  async createPendingOrder({
    userId,
    items,
    vendorDeliveryFees,
    deliveryAddress,
    phone,
    paymentReference = null,
    idempotencyKey = null,
    orderCode = null,
  }) {
    if (!userId) throw new Error("User ID is required");
    if (!Array.isArray(items) || items.length === 0) throw new Error("Order items are required");
    if (!deliveryAddress) throw new Error("Delivery address is required");
    if (!phone) throw new Error("Phone number is required");
    if (!Array.isArray(vendorDeliveryFees) || vendorDeliveryFees.length === 0) {
      throw new Error("Vendor delivery fees are required");
    }

    return prisma.$transaction(async (tx) => {
      const customerId = await resolveId(tx.user, userId);
      if (!customerId) throw new Error("User not found");

      if (idempotencyKey) {
        const existing = await tx.order.findUnique({
          where: { idempotencyKey },
          include: {
            user: { select: { legacyMongoId: true } },
            items: {
              include: {
                menuItem: { select: { legacyMongoId: true } },
                portion: { select: { legacyMongoId: true } },
                comboItem: { select: { legacyMongoId: true } },
                restaurant: { select: { legacyMongoId: true } },
              },
            },
            vendorDeliveryFees: { include: { restaurant: { select: { legacyMongoId: true } } } },
          },
        });
        if (existing) return { order: orderShape(existing), idempotent: true };
      }

      const { normalizedItems, vendorItemsMap } = await normalizeOrderItems(tx, items);
      const vendorIds = [...vendorItemsMap.keys()];
      if (vendorIds.length > 1) {
        throw new Error("Orders can only contain items from one restaurant at a time.");
      }

      const vendors = await tx.vendor.findMany({
        where: { id: { in: vendorIds } },
        include: { city: { select: { platformDeliveryFee: true } } },
      });
      if (vendors.length !== vendorIds.length) throw new Error("One or more restaurants not found");

      const frontendFeeMap = new Map();
      for (const fee of vendorDeliveryFees) {
        const restaurantId = await resolveId(tx.vendor, fee.restaurantId);
        if (restaurantId) frontendFeeMap.set(restaurantId, Number(fee.deliveryFee || 0));
      }

      const deliveryFeeMap = new Map();
      let totalDeliveryFee = 0;
      for (const vendor of vendors) {
        assertVendorIsOpen(vendor);
        if (!frontendFeeMap.has(vendor.id)) {
          throw new Error(`Missing delivery fee for restaurant ${vendor.storeName}`);
        }
        const resolvedFee = await resolveVendorDeliveryFee(tx, vendor);
        deliveryFeeMap.set(vendor.id, resolvedFee);
        totalDeliveryFee += resolvedFee;
      }

      const subtotal = normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const platformConfig = await platformConfigValue(tx);
      const serviceFee = calculateServiceFee(platformConfig, subtotal);
      const total = subtotal + totalDeliveryFee + serviceFee;
      const finalOrderCode = orderCode || generateOrderCode();
      const commissionRate = platformConfig.commissionEnabled ? Number(platformConfig.commissionRate || 0) / 100 : 0;

      const order = await tx.order.create({
        data: {
          userId: customerId,
          deliveryAddress: normalizeAddress(deliveryAddress),
          phone,
          subtotal,
          deliveryFee: totalDeliveryFee,
          serviceFee,
          total,
          orderCode: finalOrderCode,
          paymentStatus: "pending",
          paymentReference,
          idempotencyKey,
          orderStatus: "pending",
          freeDeliveryPromo: { eligible: false, reason: "not_migrated_for_postgres_order_write" },
          vendorDeliveryPromo: { applied: false, reason: "not_migrated_for_postgres_order_write" },
          statusLog: [
            {
              status: "pending",
              at: new Date().toISOString(),
              source: "postgres_order_creation_repository",
            },
          ],
          vendorDeliveryFees: {
            create: vendorIds.map((restaurantId) => ({
              restaurantId,
              deliveryFee: deliveryFeeMap.get(restaurantId) || 0,
            })),
          },
          items: {
            create: normalizedItems.map((item) => ({
              type: item.type,
              foodId: item.foodId,
              portionId: item.portionId,
              variantId: item.variantId,
              restaurantId: item.restaurantId,
              storeName: item.storeName,
              variant: item.variant,
              name: item.name,
              imageUrl: item.imageUrl,
              portionLabel: item.portionLabel,
              quantity: item.quantity,
              portionQuantity: item.portionQuantity,
              price: item.price,
              note: item.note,
              dietaryType: item.dietaryType,
              itemType: item.itemType,
              selectedOptions: item.selectedOptions,
              metadata: item.metadata,
            })),
          },
        },
        include: {
          user: { select: { legacyMongoId: true } },
          items: {
            include: {
              menuItem: { select: { legacyMongoId: true } },
              portion: { select: { legacyMongoId: true } },
              comboItem: { select: { legacyMongoId: true } },
              restaurant: { select: { legacyMongoId: true } },
            },
          },
          vendorDeliveryFees: { include: { restaurant: { select: { legacyMongoId: true } } } },
        },
      });

      for (const vendorId of vendorIds) {
        const vendorItems = vendorItemsMap.get(vendorId) || [];
        const vendorSubtotal = vendorItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const commission = Math.round(vendorSubtotal * commissionRate);
        const vendorTotal = vendorSubtotal - commission;

        await tx.vendorOrder.create({
          data: {
            restaurantId: vendorId,
            userOrderId: order.id,
            items: vendorItems.map((item) => ({
              type: item.type,
              foodId: item.foodId,
              portionId: item.portionId,
              variantId: item.variantId,
              name: item.name,
              image_url: item.imageUrl,
              portion_label: item.portionLabel,
              storeName: item.storeName,
              variant: item.variant,
              quantity: item.quantity,
              portion_quantity: item.portionQuantity,
              originalPrice: item.price,
              vendorEarning: item.price,
              dietary_type: item.dietaryType,
              item_type: item.itemType,
              selected_options: item.selectedOptions,
              note: item.note,
              metadata: item.metadata,
            })),
            commission,
            vendorTotal,
            deliveryShare: 0,
            escrowAmount: vendorTotal,
            escrowReleased: false,
            orderStatus: "pending",
          },
        });

        await tx.vendor.update({
          where: { id: vendorId },
          data: {
            totalOrders: { increment: 1 },
            totalSales: { increment: vendorSubtotal },
          },
        });
      }

      return { order: orderShape(order), idempotent: false };
    });
  },
};
