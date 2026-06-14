import prisma from "../../config/prisma.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const legacyId = (record) => record?.legacyMongoId || record?.id || null;

const compactObject = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined && fieldValue !== null));

const resolveId = async (model, id) => {
  if (!id) return null;
  if (uuidPattern.test(String(id))) return String(id);

  const record = await model.findUnique({
    where: { legacyMongoId: String(id) },
    select: { id: true },
  });

  return record?.id || null;
};

const userShape = (user) => {
  if (!user) return null;
  return compactObject({
    _id: legacyId(user),
    fullName: user.fullName,
    firstname: user.firstname,
    lastname: user.lastname,
    phone: user.phone,
    email: user.email,
    avatar: user.avatar,
  });
};

const dietaryShape = (value) => (value === "non_veg" ? "non-veg" : value);

const orderItemShape = (item) => ({
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
  dietary_type: dietaryShape(item.dietaryType),
  item_type: item.itemType,
  selected_options: item.selectedOptions,
  metadata: item.metadata,
});

const vendorDeliveryFeeShape = (fee) => ({
  restaurantId: fee.restaurant?.legacyMongoId || fee.restaurantId,
  deliveryFee: fee.deliveryFee,
});

const userOrderShape = (order) => {
  if (!order) return null;
  return {
    _id: legacyId(order),
    userId: userShape(order.user),
    items: (order.items || []).map(orderItemShape),
    vendorDeliveryFees: (order.vendorDeliveryFees || []).map(vendorDeliveryFeeShape),
    deliveryAddress: order.deliveryAddress,
    phone: order.phone,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    serviceFee: order.serviceFee,
    appliedDiscount: order.appliedDiscount,
    freeDeliveryPromo: order.freeDeliveryPromo,
    vendorDeliveryPromo: order.vendorDeliveryPromo,
    total: order.total,
    orderId: order.orderCode,
    paymentStatus: order.paymentStatus,
    paymentReference: order.paymentReference,
    idempotencyKey: order.idempotencyKey,
    orderStatus: order.orderStatus,
    riderId: order.riderId,
    riderAssignment: order.riderAssignment,
    riderEarnings: order.riderEarnings,
    statusLog: order.statusLog,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    __v: 0,
  };
};

const vendorOrderShape = (vendorOrder) => ({
  _id: legacyId(vendorOrder),
  restaurantId: vendorOrder.restaurant?.legacyMongoId || vendorOrder.restaurantId,
  userOrderId: userOrderShape(vendorOrder.userOrder),
  items: vendorOrder.items || [],
  commission: vendorOrder.commission,
  vendorTotal: vendorOrder.vendorTotal,
  deliveryShare: vendorOrder.deliveryShare,
  escrowAmount: vendorOrder.escrowAmount,
  escrowReleased: vendorOrder.escrowReleased,
  orderStatus: vendorOrder.orderStatus,
  riderId: vendorOrder.riderId,
  createdAt: vendorOrder.createdAt,
  updatedAt: vendorOrder.updatedAt,
  __v: 0,
});

const vendorOrderInclude = {
  restaurant: {
    select: {
      id: true,
      legacyMongoId: true,
    },
  },
  userOrder: {
    include: {
      user: {
        select: {
          id: true,
          legacyMongoId: true,
          fullName: true,
          firstname: true,
          lastname: true,
          phone: true,
          email: true,
          avatar: true,
        },
      },
      items: {
        include: {
          menuItem: {
            select: {
              id: true,
              legacyMongoId: true,
            },
          },
          portion: {
            select: {
              id: true,
              legacyMongoId: true,
            },
          },
          comboItem: {
            select: {
              id: true,
              legacyMongoId: true,
            },
          },
          restaurant: {
            select: {
              id: true,
              legacyMongoId: true,
            },
          },
        },
      },
      vendorDeliveryFees: {
        include: {
          restaurant: {
            select: {
              id: true,
              legacyMongoId: true,
            },
          },
        },
      },
    },
  },
};

export const vendorOrdersRepository = {
  async listVendorOrders(vendorId) {
    const resolvedVendorId = await resolveId(prisma.vendor, vendorId);
    if (!resolvedVendorId) return [];

    const vendorOrders = await prisma.vendorOrder.findMany({
      where: { restaurantId: resolvedVendorId },
      orderBy: { createdAt: "desc" },
      include: vendorOrderInclude,
    });

    return vendorOrders.map(vendorOrderShape);
  },

  async getVendorOrder(vendorOrderId) {
    const vendorOrder = await prisma.vendorOrder.findFirst({
      where: uuidPattern.test(String(vendorOrderId)) ? { id: vendorOrderId } : { legacyMongoId: String(vendorOrderId) },
      include: vendorOrderInclude,
    });

    return vendorOrder ? vendorOrderShape(vendorOrder) : null;
  },
};
