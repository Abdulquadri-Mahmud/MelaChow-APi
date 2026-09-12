import prisma from "../../config/prisma.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  meal_group_label: item.mealGroupLabel,
  dietary_type: dietaryShape(item.dietaryType),
  item_type: item.itemType,
  selected_options: item.selectedOptions,
  metadata: item.metadata,
});

const vendorDeliveryFeeShape = (fee) => ({
  restaurantId: fee.restaurant?.legacyMongoId || fee.restaurantId,
  deliveryFee: fee.deliveryFee,
});

const riderShape = (rider) => {
  if (!rider) return null;
  return compactObject({
    _id: legacyId(rider),
    name: rider.name,
    phone: rider.phone,
    vehicleType: rider.vehicleType,
    vehicleOwnership: rider.vehicleOwnership,
    avatar: rider.avatar,
    status: rider.status,
  });
};

const userOrderShape = (order) => {
  if (!order) return null;
  return {
    _id: legacyId(order),
    userId: userShape(order.user),
    items: (order.items || []).map(orderItemShape),
    vendorDeliveryFees: (order.vendorDeliveryFees || []).map(vendorDeliveryFeeShape),
    deliveryAddress: order.deliveryAddress,
    phone: order.phone,
    restaurantNotes: order.restaurantNotes,
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
    riderId: riderShape(order.rider) || order.riderId,
    riderAssignment: order.riderAssignment,
    riderEarnings: order.riderEarnings,
    statusLog: order.statusLog,
    optionStockReservedAt: order.optionStockReservedAt,
    optionStockRestoredAt: order.optionStockRestoredAt,
    portionStockReservedAt: order.portionStockReservedAt,
    portionStockRestoredAt: order.portionStockRestoredAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    moneyUnit: "kobo",
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
  customerNote: vendorOrder.customerNote,
  deliveryShare: vendorOrder.deliveryShare,
  escrowAmount: vendorOrder.escrowAmount,
  escrowReleased: vendorOrder.escrowReleased,
  orderStatus: vendorOrder.orderStatus,
  riderId: riderShape(vendorOrder.rider) || vendorOrder.riderId,
  cityId: vendorOrder.cityId,
  stateId: vendorOrder.stateId,
  createdAt: vendorOrder.createdAt,
  updatedAt: vendorOrder.updatedAt,
  moneyUnit: "kobo",
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

const customerOrderInclude = {
  user: {
    select: { id: true, legacyMongoId: true, fullName: true, firstname: true, lastname: true, phone: true, email: true, avatar: true },
  },
  rider: {
    select: { id: true, legacyMongoId: true, name: true, phone: true, vehicleType: true, vehicleOwnership: true, avatar: true, status: true },
  },
  items: {
    include: {
      menuItem: { select: { id: true, legacyMongoId: true } },
      portion: { select: { id: true, legacyMongoId: true } },
      comboItem: { select: { id: true, legacyMongoId: true } },
      restaurant: { select: { id: true, legacyMongoId: true } },
    },
  },
  vendorDeliveryFees: { include: { restaurant: { select: { id: true, legacyMongoId: true } } } },
};

export const vendorOrdersRepository = {
  async listCustomerOrders(userToken) {
    const userId = await resolveId(prisma.user, userToken);
    if (!userId) return [];
    return (await prisma.order.findMany({
      where: { userId },
      include: customerOrderInclude,
      orderBy: { createdAt: "desc" },
    })).map(userOrderShape);
  },

  async getCustomerOrder(orderToken, userToken) {
    const userId = await resolveId(prisma.user, userToken);
    if (!userId) return null;
    const order = await prisma.order.findFirst({
      where: {
        userId,
        ...(uuidPattern.test(String(orderToken))
          ? { id: String(orderToken) }
          : /^[0-9a-fA-F]{24}$/.test(String(orderToken))
            ? { legacyMongoId: String(orderToken) }
            : { orderCode: String(orderToken) }),
      },
      include: customerOrderInclude,
    });
    if (!order) return null;
    const vendorOrders = await prisma.vendorOrder.findMany({ where: { userOrderId: order.id }, include: vendorOrderInclude });
    const statuses = vendorOrders.map((entry) => entry.orderStatus);
    const priority = ["refunded", "failed", "cancelled", "completed", "delivered", "out_for_delivery", "rider_assigned", "ready_for_pickup", "preparing", "accepted", "pending"];
    return {
      order: userOrderShape(order),
      vendorOrders: vendorOrders.map(vendorOrderShape),
      deliveryOtp: null,
      trackingStatus: priority.find((status) => statuses.includes(status)) || order.orderStatus,
    };
  },

  async cancelCustomerOrder(orderToken, userToken, options = {}) {
    const reason = options.reason || "customer_cancel";
    const source = options.source || "postgres_customer_cancel";
    const changedBy = options.changedBy || "customer";
    const userId = await resolveId(prisma.user, userToken);
    if (!userId) return { error: "not_found" };
    const order = await prisma.order.findFirst({
      where: { userId, ...(uuidPattern.test(String(orderToken)) ? { id: String(orderToken) } : /^[0-9a-fA-F]{24}$/.test(String(orderToken)) ? { legacyMongoId: String(orderToken) } : { orderCode: String(orderToken) }) },
      include: { vendorOrders: { include: { restaurant: { select: { id: true, legacyMongoId: true } } } } },
    });
    if (!order) return { error: "not_found" };
    if (order.orderStatus !== "pending") return { error: "not_pending" };
    const existingRefund = await prisma.refund.findFirst({ where: { orderId: order.id } });
    if (existingRefund) return { order, refund: existingRefund, vendorOrders: order.vendorOrders };

    let refund;
    await prisma.$transaction(async (tx) => {
      let credited = order.paymentStatus !== "paid";
      if (order.paymentStatus === "paid") {
        const adminWallet = await tx.wallet.findFirst({ where: { ownerModel: "Admin" }, orderBy: { createdAt: "asc" } });
        if (adminWallet) {
          const debit = await tx.wallet.updateMany({ where: { id: adminWallet.id, balance: { gte: order.total } }, data: { balance: { decrement: order.total } } });
          if (debit.count === 1) {
            const userWallet = await tx.wallet.upsert({ where: { ownerId_ownerModel: { ownerId: order.userId, ownerModel: "User" } }, create: { ownerId: order.userId, ownerModel: "User", balance: order.total }, update: { balance: { increment: order.total } } });
            await tx.walletTransaction.createMany({ data: [
              { walletId: adminWallet.id, type: "debit", amount: order.total, transactionType: "refund", orderId: order.id, description: `Cancellation refund for ${order.orderCode}`, metadata: { source, reason } },
              { walletId: userWallet.id, type: "credit", amount: order.total, transactionType: "refund", orderId: order.id, description: `Refund for cancelled Order ${order.orderCode}`, metadata: { source, reason } },
            ] });
            credited = true;
          }
        }
      }
      const statusLog = Array.isArray(order.statusLog) ? order.statusLog : [];
      await tx.order.update({ where: { id: order.id }, data: { orderStatus: "cancelled", paymentStatus: order.paymentStatus === "paid" && credited ? "refunded" : order.paymentStatus, statusLog: [...statusLog, { status: "cancelled", changedBy, timestamp: new Date().toISOString() }] } });
      await tx.vendorOrder.updateMany({ where: { userOrderId: order.id, orderStatus: { notIn: ["delivered", "completed"] } }, data: { orderStatus: "cancelled" } });
      if (order.paymentStatus === "paid") refund = await tx.refund.create({ data: { orderId: order.id, userId: order.userId, amount: BigInt(order.total), reason, status: credited ? "completed" : "pending", metadata: { walletCreditSucceeded: credited, source } } });
    }, { isolationLevel: "Serializable" });
    return { order, refund: refund || { amount: 0, status: "not_required" }, vendorOrders: order.vendorOrders };
  },

  async autoCancelStalePendingOrders({ olderThanMinutes = 10, limit = 50 } = {}) {
    const cutoff = new Date(Date.now() - Number(olderThanMinutes || 10) * 60 * 1000);
    const candidates = await prisma.order.findMany({
      where: {
        paymentStatus: "paid",
        orderStatus: "pending",
        createdAt: { lte: cutoff },
        vendorOrders: { some: {}, every: { orderStatus: "pending" } },
      },
      select: { id: true, userId: true, orderCode: true },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    const results = [];
    for (const order of candidates) {
      try {
        const result = await this.cancelCustomerOrder(order.id, order.userId, {
          reason: "auto_cancel",
          source: "postgres_vendor_timeout",
          changedBy: "system:vendor_timeout",
        });
        results.push({ orderId: order.orderCode, success: !result.error, error: result.error || null });
      } catch (error) {
        results.push({ orderId: order.orderCode, success: false, error: error.message });
      }
    }
    return results;
  },

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
