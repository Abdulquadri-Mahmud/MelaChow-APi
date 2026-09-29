import crypto from "crypto";
import prisma from "../../config/prisma.js";
import { assertVendorIsOpen } from "../../utils/vendorOpenStatus.js";
import { quoteVendorDelivery } from "../deliveryPricing.service.js";

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

export const calculateServiceFeeKobo = (config, subtotalKobo) => {
  const subtotal = Math.max(0, Math.round(Number(subtotalKobo) || 0));
  if (!config.serviceFeeEnabled || !subtotal || subtotal <= 0) return 0;

  if (config.serviceFeeType === "fixed") {
    // Fixed service-fee configuration is entered in naira while PostgreSQL
    // order money is stored in kobo.
    return Math.max(0, Math.round(Number(config.serviceFeeValue || 0) * 100));
  }

  if (config.serviceFeeType === "percentage") {
    const rawFee = (subtotal * Number(config.serviceFeeValue || 0)) / 100;
    const capKobo = Math.max(0, Number(config.serviceFeeCap || 0) * 100);
    const cappedFee = capKobo > 0 ? Math.min(rawFee, capKobo) : rawFee;
    return Math.max(0, Math.round(cappedFee));
  }

  return 0;
};

const resolveVendorDeliveryFee = (vendor, platformConfig) => {
  if (vendor.platformDeliveryFeeOverride != null && vendor.platformDeliveryFeeOverride > 0) {
    return vendor.platformDeliveryFeeOverride;
  }
  const fallbackNaira = Number(platformConfig?.distanceDeliveryConfig?.fallbackFlatFeeNaira ?? 400);
  return Math.max(0, Math.round(fallbackNaira * 100));
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

  // Accept both the current customer payload (one flat entry per selected option)
  // and the older grouped payload. Choice enrichment must not stop checkout during launch.
  const requestedChoices = [];
  for (const selection of Array.isArray(selectedChoices) ? selectedChoices : []) {
    const groupId = await resolveId(tx.menuItemChoiceGroup, selection.group_id || selection.groupId);
    const optionIds = Array.isArray(selection.option_ids || selection.optionIds)
      ? (selection.option_ids || selection.optionIds).map((id) => ({ id, quantity: 1 }))
      : [{ id: selection.option_id || selection.optionId, quantity: selection.quantity }];

    for (const requested of optionIds) {
      if (!groupId || !requested.id) continue;
      requestedChoices.push({ groupId, optionId: requested.id, quantity: Math.max(1, Number(requested.quantity) || 1) });
    }
  }

  const resolvedChoices = [];
  let choicesPrice = 0;

  for (const requested of requestedChoices) {
    const group = groupMap.get(requested.groupId);
    const optionId = await resolveId(tx.menuItemChoiceOption, requested.optionId);
    const option = optionId ? optionMap.get(optionId) : null;

    // Do not reject an otherwise valid order because a launch-era option has
    // changed or been removed. Valid options are still priced from the database.
    if (!group || !option || option.groupId !== group.id) continue;

    const quantity = requested.quantity;
    choicesPrice += Number(option.priceModifier || 0) * quantity;
    resolvedChoices.push({
      group_id: legacyId(group),
      group_name: group.name,
      option_id: legacyId(option),
      label: option.label,
      price_modifier_naira: option.priceModifier,
      quantity,
    });
  }

  return { selectedOptions: resolvedChoices, choicesPrice };
};

export const calculateVendorCommissionKobo = (subtotalKobo, config = {}) => {
  if (!config.commissionEnabled) return 0;
  const subtotal = Math.max(0, Math.round(Number(subtotalKobo) || 0));
  const rate = Math.min(100, Math.max(0, Number(config.commissionRate) || 0));
  return Math.round((subtotal * rate) / 100);
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
        cartItem.selected_choices || cartItem.selectedChoices || cartItem.selected_options || cartItem.selectedOptions || []
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
    discountCode = null,
    promoIdentity = {},
    rawIp = "unknown",
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
        include: { city: true },
      });
      if (vendors.length !== vendorIds.length) throw new Error("One or more restaurants not found");

      const frontendFeeMap = new Map();
      for (const fee of vendorDeliveryFees) {
        const restaurantId = await resolveId(tx.vendor, fee.restaurantId);
        if (restaurantId) frontendFeeMap.set(restaurantId, Number(fee.deliveryFee || 0));
      }

      const deliveryFeeMap = new Map();
      const deliveryQuoteMap = new Map();
      let totalDeliveryFee = 0;
      const submittedAddressId = deliveryAddress?.id || deliveryAddress?._id;
      const resolvedAddressId = submittedAddressId ? await resolveId(tx.userAddress, submittedAddressId) : null;
      const selectedAddress = resolvedAddressId
        ? await tx.userAddress.findFirst({ where: { id: resolvedAddressId, userId: customerId } })
        : await tx.userAddress.findFirst({ where: { userId: customerId, isDefault: true } });
      const platformConfig = await platformConfigValue(tx);
      for (const vendor of vendors) {
        assertVendorIsOpen(vendor);
        if (!frontendFeeMap.has(vendor.id)) {
          throw new Error(`Missing delivery fee for restaurant ${vendor.storeName}`);
        }
        const quote = selectedAddress ? await quoteVendorDelivery({ vendor, address: selectedAddress, checkout: true }) : null;
        if (quote && !quote.deliverable) throw new Error(`${vendor.storeName} is outside the ${quote.radiusKm} km delivery area for this address.`);
        const resolvedFee = quote?.deliveryFeeKobo ?? resolveVendorDeliveryFee(vendor, platformConfig);
        if (quote) deliveryQuoteMap.set(vendor.id, quote);
        deliveryFeeMap.set(vendor.id, resolvedFee);
        totalDeliveryFee += resolvedFee;
      }

      const subtotal = normalizedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const originalDeliveryFee = totalDeliveryFee;
      let freeDeliveryPromo = { eligible: false, reason: "no_active_promo" };
      let vendorDeliveryPromo = { applied: false, reason: "no_active_promo" };
      let selectedPromo = null;
      if (originalDeliveryFee > 0 && vendorIds.length === 1) {
        const vendorId = vendorIds[0], now = new Date(), staleBefore = new Date(Date.now() - 45 * 60 * 1000);
        const vendorPromo = await tx.vendorDeliveryPromo.findFirst({ where: { vendorId, isActive: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] }, orderBy: { createdAt: "desc" } });
        if (vendorPromo && (vendorPromo.maxOrders == null || vendorPromo.usedOrders < vendorPromo.maxOrders)) {
          const identities=[{userId:customerId},promoIdentity.hashedDeviceId?{hashedDeviceId:promoIdentity.hashedDeviceId}:null,promoIdentity.phoneHash?{phoneHash:promoIdentity.phoneHash}:null].filter(Boolean);
          let prior=await tx.vendorDeliveryClaim.findFirst({where:{promoId:vendorPromo.id,OR:identities},include:{order:true}});
          if(prior&&(!prior.order||["failed","refunded"].includes(prior.order.paymentStatus)||prior.order.orderStatus==="cancelled"||(prior.order.paymentStatus==="pending"&&prior.order.createdAt<staleBefore))){await tx.vendorDeliveryClaim.delete({where:{id:prior.id}});await tx.vendorDeliveryPromo.updateMany({where:{id:vendorPromo.id,usedOrders:{gt:0}},data:{usedOrders:{decrement:1}}});prior=null;}
          if(!prior){selectedPromo={type:"vendor",row:vendorPromo};vendorDeliveryPromo={applied:true,promoId:vendorPromo.legacyMongoId||vendorPromo.id,vendorId,hashedDeviceId:promoIdentity.hashedDeviceId||null,phoneHash:promoIdentity.phoneHash||null,originalDeliveryFee:originalDeliveryFee/100,claimed:false};}
        }
        if(!selectedPromo){
          const platformPromo=await tx.freeDeliveryPromo.findFirst({where:{isActive:true,OR:[{startsAt:null},{startsAt:{lte:now}}],AND:[{OR:[{endsAt:null},{endsAt:{gte:now}}]}]},orderBy:{createdAt:"desc"}});
          if(platformPromo&&(platformPromo.maxOrders==null||platformPromo.usedOrders<platformPromo.maxOrders)){
            const identities=[{userId:customerId},promoIdentity.hashedDeviceId?{hashedDeviceId:promoIdentity.hashedDeviceId}:null,promoIdentity.phoneHash?{phoneHash:promoIdentity.phoneHash}:null].filter(Boolean);
            let prior=await tx.freeDeliveryClaim.findFirst({where:{promoId:platformPromo.id,OR:identities},include:{order:true}});
            if(prior&&(!prior.order||["failed","refunded"].includes(prior.order.paymentStatus)||prior.order.orderStatus==="cancelled"||(prior.order.paymentStatus==="pending"&&prior.order.createdAt<staleBefore))){await tx.freeDeliveryClaim.delete({where:{id:prior.id}});await tx.freeDeliveryPromo.updateMany({where:{id:platformPromo.id,usedOrders:{gt:0}},data:{usedOrders:{decrement:1}}});prior=null;}
            if(!prior){const hashedIp=crypto.createHash("sha256").update(rawIp||"unknown").digest("hex");const ipCount=await tx.freeDeliveryClaim.count({where:{hashedIp}});if(ipCount<5){selectedPromo={type:"platform",row:platformPromo,hashedIp};freeDeliveryPromo={eligible:true,promoId:platformPromo.legacyMongoId||platformPromo.id,hashedIp,hashedDeviceId:promoIdentity.hashedDeviceId||null,phoneHash:promoIdentity.phoneHash||null,originalDeliveryFee:originalDeliveryFee/100,claimed:false};}}
          }
        }
        if(selectedPromo){totalDeliveryFee=0;for(const key of deliveryFeeMap.keys())deliveryFeeMap.set(key,0);}
      }
      const serviceFee = calculateServiceFeeKobo(platformConfig, subtotal);
      let total = subtotal + totalDeliveryFee + serviceFee;
      let appliedDiscount = null;
      let reservedDiscount = null;
      if (discountCode) {
        const discount = await tx.discount.findUnique({ where: { code: String(discountCode).trim().toUpperCase() } });
        const now = new Date();
        if (!discount || !discount.isActive) throw new Error("Discount Error: Invalid discount code");
        if (discount.startDate > now) throw new Error("Discount Error: Discount is not active yet");
        if (discount.endDate && discount.endDate < now) throw new Error("Discount Error: Discount has expired");
        if (discount.usageLimit != null && discount.usageCount >= discount.usageLimit) throw new Error("Discount Error: Discount usage limit reached");
        if (subtotal < discount.minOrderAmount) throw new Error(`Discount Error: Minimum order of ₦${discount.minOrderAmount / 100} required`);
        if (["VENDOR_ORDER", "SPECIFIC_ITEMS"].includes(discount.scope) && discount.vendorId !== vendorIds[0]) throw new Error("Discount Error: This discount is not valid for this vendor");
        const identityFilters = [{ userId: customerId }, promoIdentity.hashedDeviceId ? { hashedDeviceId: promoIdentity.hashedDeviceId } : null, promoIdentity.phoneHash ? { phoneHash: promoIdentity.phoneHash } : null].filter(Boolean);
        if (discount.userUsageLimit != null) {
          const used = await tx.discountUsage.count({ where: { discountId: discount.id, OR: identityFilters } });
          if (used >= discount.userUsageLimit) throw new Error("Discount Error: This discount has already been used by this account, device, or phone");
        }
        let discountAmount = 0;
        if (discount.scope === "DELIVERY_FEE") discountAmount = discount.type === "FIXED" ? discount.value : Math.floor(totalDeliveryFee * discount.value / 100);
        else if (["GLOBAL_ORDER", "VENDOR_ORDER"].includes(discount.scope)) discountAmount = discount.type === "FIXED" ? discount.value : Math.floor(subtotal * discount.value / 100);
        else {
          const matching = normalizedItems.filter(item => item.foodId && discount.targetFoodIds.includes(item.foodId));
          if (!matching.length) throw new Error("Discount Error: Discount does not apply to any items in your cart");
          discountAmount = matching.reduce((sum, item) => sum + (discount.type === "FIXED" ? discount.value * item.quantity : Math.floor(item.price * item.quantity * discount.value / 100)), 0);
        }
        if (discount.maxDiscountAmount != null) discountAmount = Math.min(discountAmount, discount.maxDiscountAmount);
        discountAmount = Math.min(discountAmount, discount.scope === "DELIVERY_FEE" ? totalDeliveryFee : subtotal);
        total -= discountAmount;
        appliedDiscount = { code: discount.code, type: discount.type, amount: discountAmount / 100, scope: discount.scope, label: discount.description || discount.code, fundedBy: discount.fundedBy };
        reservedDiscount = discount;
      }
      const finalOrderCode = orderCode || generateOrderCode();

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
          appliedDiscount,
          freeDeliveryPromo,
          vendorDeliveryPromo,
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
              distanceMeters: deliveryQuoteMap.get(restaurantId)?.distanceMeters ?? null,
              pricingSnapshot: deliveryQuoteMap.get(restaurantId)?.pricingSnapshot || { pricingMode: "flat_fallback" },
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

      if(selectedPromo?.type==="vendor"){
        const claimed=await tx.vendorDeliveryPromo.updateMany({where:{id:selectedPromo.row.id,isActive:true,...(selectedPromo.row.maxOrders!=null?{usedOrders:{lt:selectedPromo.row.maxOrders}}:{})},data:{usedOrders:{increment:1}}});if(claimed.count!==1)throw new Error("Vendor delivery promo is no longer available");
        await tx.vendorDeliveryClaim.create({data:{promoId:selectedPromo.row.id,vendorId:vendorIds[0],userId:customerId,orderId:order.id,hashedDeviceId:promoIdentity.hashedDeviceId||null,phoneHash:promoIdentity.phoneHash||null,metadata:{deliveryFeeWaived:originalDeliveryFee/100}}});vendorDeliveryPromo.claimed=true;
        if(selectedPromo.row.maxOrders!=null&&selectedPromo.row.usedOrders+1>=selectedPromo.row.maxOrders){await tx.vendorDeliveryPromo.update({where:{id:selectedPromo.row.id},data:{isActive:false}});await tx.vendor.update({where:{id:vendorIds[0]},data:{hasActiveDeliveryPromo:false}});}
      }else if(selectedPromo?.type==="platform"){
        const claimed=await tx.freeDeliveryPromo.updateMany({where:{id:selectedPromo.row.id,isActive:true,...(selectedPromo.row.maxOrders!=null?{usedOrders:{lt:selectedPromo.row.maxOrders}}:{})},data:{usedOrders:{increment:1}}});if(claimed.count!==1)throw new Error("Free delivery promo is no longer available");
        await tx.freeDeliveryClaim.create({data:{promoId:selectedPromo.row.id,userId:customerId,orderId:order.id,hashedIp:selectedPromo.hashedIp,hashedDeviceId:promoIdentity.hashedDeviceId||null,phoneHash:promoIdentity.phoneHash||null,metadata:{deliveryFeeWaived:originalDeliveryFee/100}}});freeDeliveryPromo.claimed=true;
      }
      if(selectedPromo){await tx.order.update({where:{id:order.id},data:{freeDeliveryPromo,vendorDeliveryPromo}});order.freeDeliveryPromo=freeDeliveryPromo;order.vendorDeliveryPromo=vendorDeliveryPromo;}

      if (reservedDiscount) {
        const claimed = await tx.discount.updateMany({ where: { id: reservedDiscount.id, ...(reservedDiscount.usageLimit != null ? { usageCount: { lt: reservedDiscount.usageLimit } } : {}) }, data: { usageCount: { increment: 1 } } });
        if (claimed.count !== 1) throw new Error("Discount Error: Discount usage limit reached");
        await tx.discountUsage.create({ data: { discountId: reservedDiscount.id, userId: customerId, orderId: order.id, hashedDeviceId: promoIdentity.hashedDeviceId || null, phoneHash: promoIdentity.phoneHash || null } });
      }

      for (const vendorId of vendorIds) {
        const vendorItems = vendorItemsMap.get(vendorId) || [];
        const vendorSubtotal = vendorItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const commission = calculateVendorCommissionKobo(vendorSubtotal, platformConfig);
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
