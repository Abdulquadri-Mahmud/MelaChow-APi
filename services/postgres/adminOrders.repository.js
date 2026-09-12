import prisma from "../../config/prisma.js";
import { calculateRiderPayoutKobo } from "./riderPayout.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mongoIdPattern = /^[0-9a-fA-F]{24}$/;

const defaultPlatformConfig = {
  riderFixedPayout: 600,
  riderAssignmentMode: "manual",
  riderPayoutHour: 10,
  commissionEnabled: false,
  commissionRate: 0,
  serviceFeeEnabled: false,
  serviceFeeType: "fixed",
  serviceFeeValue: 0,
  serviceFeeCap: 500,
};

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

const userShape = (user) =>
  user
    ? compactObject({
        _id: legacyId(user),
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        phone: user.phone,
      })
    : null;

const riderShape = (rider) =>
  rider
    ? compactObject({
        _id: legacyId(rider),
        name: rider.name,
        phone: rider.phone,
        avatar: rider.avatar,
        status: rider.status,
      })
    : null;

const restaurantShape = (vendor) =>
  vendor
    ? compactObject({
        _id: legacyId(vendor),
        storeName: vendor.storeName,
        logo: vendor.logo,
        deliveryManagedBy: vendor.deliveryManagedBy,
      })
    : null;

const foodShape = (food) =>
  food
    ? compactObject({
        _id: legacyId(food),
        name: food.name,
        image_url: food.imageUrl,
        item_type: food.itemType,
      })
    : null;

const dietaryShape = (value) => (value === "non_veg" ? "non-veg" : value);

const orderItemShape = (item) => ({
  _id: legacyId(item),
  type: item.type,
  foodId: foodShape(item.menuItem),
  portionId: item.portion?.legacyMongoId || item.portionId,
  variantId: item.comboItem?.legacyMongoId || item.variantId,
  restaurantId: restaurantShape(item.restaurant),
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

const rawOrderItemShape = (item) => ({
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

const orderShape = (order, { deliveryType = false, activeAssignments = false } = {}) => ({
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
  riderId: riderShape(order.rider),
  riderAssignment: order.riderAssignment,
  riderEarnings: order.riderEarnings,
  statusLog: order.statusLog,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  moneyUnit: "kobo",
  __v: 0,
  ...(deliveryType ? { deliveryType: "platform_managed" } : {}),
  ...(activeAssignments ? { activeAssignments: [] } : {}),
});

const vendorSummaryShape = (vendor) =>
  vendor
    ? compactObject({
        _id: legacyId(vendor),
        storeName: vendor.storeName,
        logo: vendor.logo,
      })
    : null;

const platformVendorSummaryShape = (vendor) =>
  vendor
    ? compactObject({
        _id: legacyId(vendor),
        storeName: vendor.storeName,
        logo: vendor.logo,
        cityId: vendor.city?.legacyMongoId || vendor.cityId,
        stateId: vendor.state?.legacyMongoId || vendor.stateId,
      })
    : null;

const vendorOrderShape = (vendorOrder) => ({
  _id: legacyId(vendorOrder),
  restaurantId: vendorSummaryShape(vendorOrder.restaurant),
  userOrderId: vendorOrder.userOrder?.legacyMongoId || vendorOrder.userOrderId,
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
  moneyUnit: "kobo",
  __v: 0,
});

const platformVendorOrderShape = (vendorOrder) => ({
  _id: legacyId(vendorOrder),
  restaurantId: platformVendorSummaryShape(vendorOrder.restaurant),
  userOrderId: vendorOrder.userOrder?.legacyMongoId || vendorOrder.userOrderId,
  items: vendorOrder.items || [],
  commission: vendorOrder.commission,
  vendorTotal: vendorOrder.vendorTotal,
  deliveryShare: vendorOrder.deliveryShare,
  escrowAmount: vendorOrder.escrowAmount,
  escrowReleased: vendorOrder.escrowReleased,
  orderStatus: vendorOrder.orderStatus,
  riderId: vendorOrder.rider?.legacyMongoId || vendorOrder.riderId,
  createdAt: vendorOrder.createdAt,
  updatedAt: vendorOrder.updatedAt,
  moneyUnit: "kobo",
  __v: 0,
});

const platformOrderShape = (order) => ({
  _id: legacyId(order),
  userId: userShape(order.user),
  items: (order.items || []).map(rawOrderItemShape),
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
  riderId: riderShape(order.rider),
  riderAssignment: order.riderAssignment,
  riderEarnings: order.riderEarnings,
  statusLog: order.statusLog,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  moneyUnit: "kobo",
  __v: 0,
  vendorOrders: (order.vendorOrders || []).map(platformVendorOrderShape),
});

const orderInclude = {
  user: {
    select: {
      id: true,
      legacyMongoId: true,
      firstname: true,
      lastname: true,
      email: true,
      phone: true,
    },
  },
  rider: {
    select: {
      id: true,
      legacyMongoId: true,
      name: true,
      phone: true,
      avatar: true,
      status: true,
    },
  },
  items: {
    include: {
      menuItem: {
        select: {
          id: true,
          legacyMongoId: true,
          name: true,
          imageUrl: true,
          itemType: true,
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
          storeName: true,
          logo: true,
          deliveryManagedBy: true,
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
};

const platformOrderInclude = {
  user: orderInclude.user,
  rider: orderInclude.rider,
  items: {
    include: {
      menuItem: {
        select: {
          legacyMongoId: true,
        },
      },
      portion: {
        select: {
          legacyMongoId: true,
        },
      },
      comboItem: {
        select: {
          legacyMongoId: true,
        },
      },
      restaurant: {
        select: {
          legacyMongoId: true,
        },
      },
    },
  },
  vendorDeliveryFees: orderInclude.vendorDeliveryFees,
  vendorOrders: {
    include: {
      restaurant: {
        select: {
          id: true,
          legacyMongoId: true,
          storeName: true,
          logo: true,
          cityId: true,
          stateId: true,
          city: {
            select: {
              legacyMongoId: true,
            },
          },
          state: {
            select: {
              legacyMongoId: true,
            },
          },
        },
      },
      userOrder: {
        select: {
          legacyMongoId: true,
        },
      },
      rider: {
        select: {
          legacyMongoId: true,
        },
      },
    },
  },
};

const vendorOrderInclude = {
  restaurant: {
    select: {
      id: true,
      legacyMongoId: true,
      storeName: true,
      logo: true,
    },
  },
  userOrder: {
    select: {
      id: true,
      legacyMongoId: true,
    },
  },
};

const buildPlatformOrderWhere = ({ status, statusGroup } = {}) => {
  const where = {};

  if (status) {
    where.orderStatus = status.includes(",") ? { in: status.split(",") } : status;
  } else if (statusGroup === "logistics") {
    where.orderStatus = { in: ["ready_for_pickup", "rider_assigned"] };
  }

  return where;
};

const buildCommissionLedgerWhere = ({ startDate, endDate } = {}) => {
  // Keep parity with the Mongo ledger: revenue from delivery can only be
  // recognised once the delivery itself is complete. This also keeps paid but
  // later-cancelled/refunded orders out of delivery-profit reporting.
  const where = {
    paymentStatus: "paid",
    orderStatus: { in: ["delivered", "completed"] },
  };

  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  return where;
};

const buildOrderWhere = async ({ status, paymentStatus, vendorId, startDate, endDate, search } = {}) => {
  const where = {};

  if (status) {
    where.orderStatus = status.includes(",") ? { in: status.split(",") } : status;
  }
  if (paymentStatus) where.paymentStatus = paymentStatus;
  if (vendorId) {
    const resolvedVendorId = await resolveId(prisma.vendor, vendorId);
    where.items = {
      some: {
        restaurantId: resolvedVendorId || "__missing_vendor__",
      },
    };
  }
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }
  if (search) {
    where.OR = [
      { orderCode: { contains: String(search), mode: "insensitive" } },
      { phone: { contains: String(search), mode: "insensitive" } },
      { deliveryAddress: { path: ["name"], string_contains: String(search) } },
    ];
  }

  return where;
};

const parentStatusFromVendorStatuses = (statuses) => {
  if (statuses.length === 1) return statuses[0];
  if (statuses.every((status) => status === "completed")) return "completed";
  if (statuses.every((status) => status === "delivered")) return "delivered";
  if (statuses.includes("out_for_delivery")) return "out_for_delivery";
  if (statuses.includes("rider_assigned")) return "rider_assigned";
  if (statuses.includes("ready_for_pickup")) return "ready_for_pickup";
  if (statuses.includes("preparing")) return "preparing";
  if (statuses.includes("accepted")) return "accepted";
  if (statuses.every((status) => status === "cancelled")) return "cancelled";
  if (statuses.includes("pending")) return "pending";
  return "pending";
};

const liveJobBoardExpiry = () => new Date("9999-12-31T23:59:59.999Z");

const locationLegacyId = async (model, uuid) => {
  if (!uuid) return null;
  const record = await model.findUnique({ where: { id: uuid }, select: { legacyMongoId: true } });
  return record?.legacyMongoId || null;
};

const getPostgresPlatformConfig = async () => {
  const config = await prisma.platformConfig.findUnique({
    where: { type: "singleton" },
    select: { value: true },
  });

  return {
    ...defaultPlatformConfig,
    ...(config?.value && typeof config.value === "object" && !Array.isArray(config.value) ? config.value : {}),
  };
};

const commissionLedgerOrderShape = (order, platformConfig) => {
  const riderEarnings = order.riderEarnings ?? calculateRiderPayoutKobo(order.deliveryFee, platformConfig);
  const totalCommission = (order.vendorOrders || []).reduce((sum, vendorOrder) => sum + (vendorOrder.commission || 0), 0);
  const deliveryFeeHeld = 0;
  const deliverySpread = Math.max(0, order.deliveryFee - riderEarnings);

  return {
    _id: legacyId(order),
    orderId: order.orderCode,
    createdAt: order.createdAt,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    serviceFee: order.serviceFee || 0,
    riderEarnings,
    total: order.total,
    numberOfVendors: (order.vendorOrders || []).length,
    vendorNames: [...new Set((order.items || []).map((item) => item.restaurant?.storeName).filter(Boolean))],
    totalCommission,
    deliveryFeeHeld,
    deliverySpread,
    platformRevenue: totalCommission + (order.serviceFee || 0) + deliverySpread,
    moneyUnit: "kobo",
  };
};

export const adminOrdersRepository = {
  async listOrders(query = {}) {
    const page = parseInt(query.page || 1, 10);
    const limit = parseInt(query.limit || 20, 10);
    const skip = (page - 1) * limit;
    const where = await buildOrderWhere(query);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return {
      success: true,
      data: {
        orders: orders.map((order) => orderShape(order, { activeAssignments: true })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  },

  async listPlatformManagedOrders(query = {}) {
    const page = parseInt(query.page || 1, 10);
    const limit = parseInt(query.limit || 20, 10);
    const skip = (page - 1) * limit;
    const where = buildPlatformOrderWhere(query);

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: platformOrderInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return {
      success: true,
      data: {
        orders: orders.map(platformOrderShape),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  },

  async getOrder(orderId) {
    let order = await prisma.order.findFirst({
      where: mongoIdPattern.test(String(orderId))
        ? { legacyMongoId: String(orderId) }
        : uuidPattern.test(String(orderId))
          ? { id: String(orderId) }
          : { orderCode: String(orderId) },
      include: orderInclude,
    });

    if (!order && (mongoIdPattern.test(String(orderId)) || uuidPattern.test(String(orderId)))) {
      const vendorOrder = await prisma.vendorOrder.findFirst({
        where: uuidPattern.test(String(orderId)) ? { id: String(orderId) } : { legacyMongoId: String(orderId) },
        select: { userOrderId: true },
      });
      if (vendorOrder) {
        order = await prisma.order.findUnique({
          where: { id: vendorOrder.userOrderId },
          include: orderInclude,
        });
      }
    }

    if (!order) return null;

    const vendorOrders = await prisma.vendorOrder.findMany({
      where: { userOrderId: order.id },
      include: vendorOrderInclude,
    });
    const vendorIds = [...new Set((order.items || []).map((item) => item.restaurantId).filter(Boolean))];
    const wallets = vendorIds.length
      ? await prisma.wallet.findMany({
          where: {
            ownerId: { in: vendorIds },
            ownerModel: "Vendor",
          },
          select: {
            ownerId: true,
            balance: true,
          },
        })
      : [];
    const vendorWallets = {};
    for (const wallet of wallets) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: wallet.ownerId },
        select: { legacyMongoId: true, id: true },
      });
      vendorWallets[vendor?.legacyMongoId || vendor?.id || wallet.ownerId] = wallet.balance;
    }

    const financialSummary = {
      subtotal: order.subtotal,
      totalDeliveryFee: order.deliveryFee,
      discountAmount: order.appliedDiscount?.amount || 0,
      totalCommission: vendorOrders.reduce((sum, vendorOrder) => sum + (vendorOrder.commission || 0), 0),
      totalVendorEarnings: vendorOrders.reduce((sum, vendorOrder) => sum + (vendorOrder.vendorTotal || 0), 0),
      total: order.total,
      moneyUnit: "kobo",
    };

    return {
      success: true,
      data: {
        order: orderShape(order, { deliveryType: true }),
        vendorOrders: vendorOrders.map(vendorOrderShape),
        financialSummary,
        vendorWallets,
      },
    };
  },

  async getCommissionLedger(query = {}) {
    const page = parseInt(query.page || 1, 10);
    const limit = parseInt(query.limit || 20, 10);
    const skip = (page - 1) * limit;
    const where = buildCommissionLedgerWhere(query);
    const platformConfig = await getPostgresPlatformConfig();

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        select: {
          id: true,
          legacyMongoId: true,
          orderCode: true,
          createdAt: true,
          subtotal: true,
          deliveryFee: true,
          serviceFee: true,
          riderEarnings: true,
          total: true,
          items: {
            select: {
              restaurant: {
                select: {
                  storeName: true,
                },
              },
            },
          },
          vendorOrders: {
            select: {
              commission: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.order.count({ where }),
    ]);

    const ledgerOrders = orders.map((order) => commissionLedgerOrderShape(order, platformConfig));
    const pagedOrders = ledgerOrders.slice(skip, skip + limit);
    const summary = ledgerOrders.reduce(
      (totals, order) => ({
        totalCommissionEarned: totals.totalCommissionEarned + order.totalCommission,
        totalDeliveryFeesHeld: totals.totalDeliveryFeesHeld + order.deliveryFeeHeld,
        totalDeliverySpread: totals.totalDeliverySpread + order.deliverySpread,
        totalServiceFees: totals.totalServiceFees + order.serviceFee,
        combinedPlatformRevenue: totals.combinedPlatformRevenue + order.platformRevenue,
      }),
      {
        totalCommissionEarned: 0,
        totalDeliveryFeesHeld: 0,
        totalDeliverySpread: 0,
        totalServiceFees: 0,
        combinedPlatformRevenue: 0,
      }
    );

    return {
      success: true,
      data: {
        summary: { ...summary, moneyUnit: "kobo" },
        orders: pagedOrders,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  },

  async getStats({ startDate, endDate } = {}) {
    const where = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [orders, vendorOrders, recentOrders] = await Promise.all([
      prisma.order.findMany({
        where,
        select: {
          total: true,
          deliveryFee: true,
          paymentStatus: true,
          orderStatus: true,
        },
      }),
      prisma.vendorOrder.findMany({
        where,
        select: {
          commission: true,
        },
      }),
      prisma.order.findMany({
        where: { paymentStatus: "paid" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          legacyMongoId: true,
          id: true,
          orderCode: true,
          total: true,
          orderStatus: true,
          createdAt: true,
        },
      }),
    ]);

    const ordersByStatus = {};
    const ordersByPaymentStatus = {};
    for (const order of orders) {
      ordersByStatus[order.orderStatus] = (ordersByStatus[order.orderStatus] || 0) + 1;
      ordersByPaymentStatus[order.paymentStatus] = (ordersByPaymentStatus[order.paymentStatus] || 0) + 1;
    }

    return {
      success: true,
      data: {
        moneyUnit: "kobo",
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum, order) => sum + (order.paymentStatus === "paid" ? order.total : 0), 0),
        totalCommission: vendorOrders.reduce((sum, vendorOrder) => sum + (vendorOrder.commission || 0), 0),
        platformDeliveryRevenue: orders.reduce((sum, order) => sum + (order.paymentStatus === "paid" ? order.deliveryFee : 0), 0),
        ordersByStatus,
        ordersByPaymentStatus,
        recentOrders: recentOrders.map((order) => ({
          _id: legacyId(order),
          orderId: order.orderCode,
          total: order.total,
          orderStatus: order.orderStatus,
          createdAt: order.createdAt,
          moneyUnit: "kobo",
        })),
      },
    };
  },

  async adminOverrideOrderStatus({ orderCode, status, reason, adminId }) {
    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { orderCode: String(orderCode) },
          ...(uuidPattern.test(String(orderCode)) ? [{ id: String(orderCode) }] : []),
          ...(mongoIdPattern.test(String(orderCode)) ? [{ legacyMongoId: String(orderCode) }] : []),
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            legacyMongoId: true,
          },
        },
        vendorOrders: {
          include: {
            restaurant: {
              select: {
                id: true,
                legacyMongoId: true,
                storeName: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return { success: false, status: 404, message: "Order not found" };
    }

    const previousStatus = order.orderStatus;
    const statusLog = Array.isArray(order.statusLog) ? order.statusLog : [];
    const adminLegacyId = adminId ? String(adminId) : "";

    let refundResult = null;
    await prisma.$transaction(async (tx) => {
      let paymentStatus = order.paymentStatus;
      if (status === "cancelled" && order.paymentStatus === "paid") {
        const existing = await tx.refund.findFirst({ where: { orderId: order.id } });
        if (existing) {
          refundResult = { status: existing.status, amount: Number(existing.amount) };
          paymentStatus = existing.status === "completed" ? "refunded" : order.paymentStatus;
        } else {
          const refundAmount = order.total;
          const adminWallet = await tx.wallet.findFirst({ where: { ownerModel: "Admin" }, orderBy: { createdAt: "asc" } });
          let credited = false;
          if (adminWallet) {
            const debited = await tx.wallet.updateMany({ where: { id: adminWallet.id, balance: { gte: refundAmount } }, data: { balance: { decrement: refundAmount } } });
            if (debited.count === 1) {
              const userWallet = await tx.wallet.upsert({ where: { ownerId_ownerModel: { ownerId: order.userId, ownerModel: "User" } }, create: { ownerId: order.userId, ownerModel: "User", balance: refundAmount }, update: { balance: { increment: refundAmount } } });
              await tx.walletTransaction.createMany({ data: [
                { walletId: adminWallet.id, type: "debit", amount: refundAmount, transactionType: "refund", orderId: order.id, description: `Refund to customer for Order ${order.orderCode} - ${reason || "admin_cancel"}`, metadata: { source: "postgres_admin_cancel_refund" } },
                { walletId: userWallet.id, type: "credit", amount: refundAmount, transactionType: "refund", orderId: order.id, description: `Refund for cancelled Order ${order.orderCode}`, metadata: { source: "postgres_admin_cancel_refund" } },
              ] });
              credited = true;
              paymentStatus = "refunded";
            }
          }
          const refund = await tx.refund.create({ data: { orderId: order.id, userId: order.userId, amount: BigInt(refundAmount), reason: reason || "admin_cancel", status: credited ? "completed" : "pending", metadata: { originalTotal: refundAmount, commissionRetained: 0, orderStatusAtCancellation: previousStatus, walletCreditSucceeded: credited, notes: credited ? "Full refund credited to customer wallet" : "Admin wallet missing or insufficient; manual wallet credit required" } } });
          refundResult = { status: refund.status, amount: Number(refund.amount) };
        }
      }

      await tx.order.update({ where: { id: order.id }, data: { orderStatus: status, paymentStatus, statusLog: [...statusLog, { status, changedBy: `admin:${adminLegacyId}`, timestamp: new Date().toISOString() }] } });
      await tx.vendorOrder.updateMany({ where: { userOrderId: order.id }, data: { orderStatus: status } });
    }, { isolationLevel: "Serializable" });

    return {
      success: true,
      message: "Order status updated by admin",
      data: { orderId: order.orderCode, previousStatus, newStatus: status, reason, refund: refundResult ? { ...refundResult, amount: refundResult.amount / 100 } : null },
      notificationContext: {
        userId: order.user?.legacyMongoId || order.userId,
        orderLegacyId: legacyId(order),
        vendorOrders: order.vendorOrders.map((vendorOrder) => ({
          restaurantId: vendorOrder.restaurant?.legacyMongoId || vendorOrder.restaurantId,
          storeName: vendorOrder.restaurant?.storeName || "",
        })),
      },
    };
  },

  async acceptOrderOnBehalf({ orderToken, vendorOrderToken = null, adminId = null }) {
    const order = await prisma.order.findFirst({
      where: { OR: [{ orderCode: String(orderToken) }, { legacyMongoId: String(orderToken) }, ...(uuidPattern.test(String(orderToken)) ? [{ id: String(orderToken) }] : [])] },
      include: { user: { select: { legacyMongoId: true } }, vendorOrders: { include: { restaurant: { select: { legacyMongoId: true, storeName: true } } } } },
    });
    if (!order) return { success: false, status: 404, message: "Order not found" };
    let targets = order.vendorOrders;
    if (vendorOrderToken) targets = targets.filter((row) => [row.id, row.legacyMongoId].includes(String(vendorOrderToken)));
    if (!targets.length) return { success: false, status: 404, message: "Vendor order not found" };
    const now = new Date();
    const statusLog = Array.isArray(order.statusLog) ? order.statusLog : [];
    await prisma.$transaction(async (tx) => {
      if (["pending", "accepted"].includes(order.orderStatus)) await tx.order.update({ where: { id: order.id }, data: { orderStatus: "accepted", statusLog: [...statusLog, { status: "accepted", changedBy: `admin:${adminId || "unknown"}:on_behalf_of_restaurant`, timestamp: now.toISOString() }] } });
      await tx.vendorOrder.updateMany({ where: { id: { in: targets.map((row) => row.id) } }, data: { orderStatus: "accepted" } });
    });
    return { success: true, message: "Order accepted on behalf of restaurant", orderId: order.orderCode, notificationContext: { userId: order.user?.legacyMongoId || order.userId, orderLegacyId: legacyId(order), vendors: targets.map((row) => ({ vendorOrderId: row.legacyMongoId || row.id, restaurantId: row.restaurant?.legacyMongoId || row.restaurantId, storeName: row.restaurant?.storeName || "" })) } };
  },

  async assignRiders({ vendorOrderToken, riderTokens, adminId = null }) {
    const vendorOrderId = await resolveId(prisma.vendorOrder, vendorOrderToken);
    if (!vendorOrderId) return { success: false, status: 404, message: "No order found for assignment." };
    const vendorOrder = await prisma.vendorOrder.findUnique({ where: { id: vendorOrderId }, include: { userOrder: true, restaurant: true } });
    const riderIds = [...new Set((await Promise.all(riderTokens.map((token) => resolveId(prisma.rider, token)))).filter(Boolean))];
    if (riderIds.length !== new Set(riderTokens.map(String)).size) return { success: false, status: 404, message: "One or more riders were not found." };
    const riders = await prisma.rider.findMany({ where: { id: { in: riderIds } } });
    if (riders.some((rider) => !rider.isActive || !rider.isVerified || rider.deletedAt || rider.currentOrderId || !["available", "pending_assignment"].includes(rider.status))) return { success: false, status: 409, message: "One or more riders are unavailable or already assigned." };
    const cityId = vendorOrder.restaurant.cityId;
    const stateId = vendorOrder.restaurant.stateId;
    if (!cityId || !stateId) return { success: false, status: 400, message: "This order must have a defined city and state before assigning a rider." };
    if (riders.some((rider) => rider.cityId !== cityId || rider.stateId !== stateId)) return { success: false, status: 400, message: "Every rider must be assigned to the same city and state as this order." };
    const expiresAt = liveJobBoardExpiry(), now = new Date().toISOString(), statusLog = Array.isArray(vendorOrder.userOrder.statusLog) ? vendorOrder.userOrder.statusLog : [];
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: vendorOrder.userOrderId }, data: { riderAssignment: { status: "offered", assignedAt: now, acceptedAt: null, rejectedAt: null, expiresAt: expiresAt.toISOString(), lastReason: "", assignedBy: adminId }, statusLog: [...statusLog, { status: "rider_offer_broadcast", changedBy: `admin:${adminId || "unknown"}`, timestamp: now }] } });
      await tx.riderAssignment.createMany({ data: riders.map((rider) => ({ orderId: vendorOrder.userOrderId, vendorOrderId: vendorOrder.id, riderId: rider.id, vendorId: vendorOrder.restaurantId, stateId, cityId, status: "pending", expiresAt, metadata: { assignedBy: adminId, assignedAt: now, restaurantName: vendorOrder.restaurant.storeName, orderReadableId: vendorOrder.userOrder.orderCode, assignmentMode: "manual" } })) });
    });
    return { success: true, message: "Rider assignment offers sent successfully", data: { orderId: vendorOrder.userOrder.orderCode, vendorOrderId: legacyId(vendorOrder), riderIds: riders.map(legacyId), expiresAt } };
  },

  async updateVendorOrderStatus({ vendorOrderLegacyId, vendorLegacyId, status }) {
    if (!["pending", "accepted", "preparing", "ready_for_pickup", "cancelled"].includes(status)) {
      return {
        success: false,
        status: 409,
        message: "Postgres vendor status write is currently limited to pending, accepted, preparing, and ready_for_pickup transitions",
      };
    }

    const vendorId = await resolveId(prisma.vendor, vendorLegacyId);
    const vendor = vendorId ? await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, legacyMongoId: true, storeName: true, deliveryManagedBy: true },
    }) : null;
    if (!vendor) return { success: false, status: 404, message: "Vendor not found" };

    const vendorOrderId = await resolveId(prisma.vendorOrder, vendorOrderLegacyId);
    const vendorOrder = vendorOrderId ? await prisma.vendorOrder.findUnique({
      where: { id: vendorOrderId },
      include: {
        restaurant: { select: { id: true, legacyMongoId: true, storeName: true, deliveryManagedBy: true } },
        userOrder: {
          include: {
            user: { select: { id: true, legacyMongoId: true } },
            vendorOrders: { select: { id: true, orderStatus: true } },
          },
        },
      },
    }) : null;

    if (!vendorOrder) return { success: false, status: 404, message: "Vendor order not found" };
    if (vendorOrder.restaurantId !== vendor.id) return { success: false, status: 403, message: "Access denied to this order" };

    const isPlatformManaged = vendor.deliveryManagedBy === "admin";
    if (isPlatformManaged && ["out_for_delivery", "delivered", "completed"].includes(status)) {
      return {
        success: false,
        status: 403,
        message: `Action denied. This order is platform-managed. You can update status up to "ready_for_pickup", but subsequent updates must be handled by the rider.`,
      };
    }

    const previousStatus = vendorOrder.orderStatus;
    if (status === "cancelled" && ["ready_for_pickup", "ready"].includes(previousStatus)) {
      return {
        success: false,
        status: 409,
        message: "This order is already marked ready. Vendors can no longer cancel it; contact admin support if there is a serious issue.",
      };
    }

    const siblingStatuses = vendorOrder.userOrder.vendorOrders.map((entry) => (entry.id === vendorOrder.id ? status : entry.orderStatus));
    const parentStatus = parentStatusFromVendorStatuses(siblingStatuses);
    const statusLog = Array.isArray(vendorOrder.userOrder.statusLog) ? vendorOrder.userOrder.statusLog : [];

    const [updatedVendorOrder] = await prisma.$transaction([
      prisma.vendorOrder.update({
        where: { id: vendorOrder.id },
        data: { orderStatus: status },
        include: {
          restaurant: { select: { id: true, legacyMongoId: true, storeName: true, deliveryManagedBy: true } },
          userOrder: { select: { id: true, legacyMongoId: true, orderCode: true, total: true, userId: true } },
        },
      }),
      prisma.order.update({
        where: { id: vendorOrder.userOrderId },
        data: {
          orderStatus: parentStatus,
          statusLog: [
            ...statusLog,
            {
              status: parentStatus,
              changedBy: "vendor",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      }),
    ]);

    return {
      success: true,
      message: "Order status updated successfully",
      vendorOrder: {
        _id: legacyId(updatedVendorOrder),
        orderStatus: updatedVendorOrder.orderStatus,
        userOrderId: legacyId(updatedVendorOrder.userOrder),
        restaurantId: legacyId(updatedVendorOrder.restaurant),
        items: updatedVendorOrder.items,
        createdAt: updatedVendorOrder.createdAt,
        updatedAt: updatedVendorOrder.updatedAt,
      },
      previousStatus,
      newStatus: status,
      notificationContext: {
        userId: vendorOrder.userOrder.user?.legacyMongoId || vendorOrder.userOrder.userId,
        orderId: vendorOrder.userOrder.orderCode,
        orderLegacyId: vendorOrder.userOrder.legacyMongoId,
        vendorOrderLegacyId: legacyId(vendorOrder),
        restaurantId: legacyId(vendor),
        restaurantName: vendor.storeName,
        totalAmount: vendorOrder.userOrder.total,
        items: vendorOrder.items,
        isReadyTransition: ["ready_for_pickup", "ready"].includes(status) && !["ready_for_pickup", "ready"].includes(previousStatus),
      },
    };
  },

  async offerReadyVendorOrderToAvailableRiders({ vendorOrderLegacyId, assignedBy = null }) {
    const automaticAssignmentExpiresAt = liveJobBoardExpiry();
    const resolvedVendorOrderId = await resolveId(prisma.vendorOrder, vendorOrderLegacyId);
    const vendorOrder = resolvedVendorOrderId ? await prisma.vendorOrder.findUnique({
      where: { id: resolvedVendorOrderId },
      include: {
        restaurant: {
          select: {
            id: true,
            legacyMongoId: true,
            storeName: true,
            cityId: true,
            stateId: true,
          },
        },
        userOrder: {
          select: {
            id: true,
            legacyMongoId: true,
            orderCode: true,
            deliveryAddress: true,
            items: true,
            statusLog: true,
            riderId: true,
            orderStatus: true,
          },
        },
      },
    }) : null;

    if (!vendorOrder?.userOrder) {
      return { success: false, reason: "order_not_found", riderCount: 0 };
    }

    const deliveryAddress = vendorOrder.userOrder.deliveryAddress || {};
    const cityId = (await resolveId(prisma.city, deliveryAddress.cityId)) || vendorOrder.restaurant.cityId;
    const stateId = (await resolveId(prisma.state, deliveryAddress.stateId)) || vendorOrder.restaurant.stateId;
    const cityLegacyId = deliveryAddress.cityId || (await locationLegacyId(prisma.city, cityId));
    const stateLegacyId = deliveryAddress.stateId || (await locationLegacyId(prisma.state, stateId));

    if (!cityId || !stateId) {
      return { success: false, reason: "missing_location", riderCount: 0 };
    }

    const candidateRiders = await prisma.rider.findMany({
      where: {
        cityId,
        stateId,
        status: "available",
        currentOrderId: null,
        isActive: true,
        isVerified: true,
        deletedAt: null,
      },
      select: {
        id: true,
        legacyMongoId: true,
        name: true,
        status: true,
        currentOrderId: true,
      },
    });

    const staleAssignments = await prisma.riderAssignment.findMany({
      where: {
        riderId: { in: candidateRiders.map((rider) => rider.id) },
        status: "pending",
        expiresAt: { lte: new Date() },
      },
      select: { id: true, riderId: true },
    });
    const staleRiderIds = [...new Set(staleAssignments.map((assignment) => assignment.riderId).filter(Boolean))];
    if (staleAssignments.length) {
      await prisma.$transaction([
        prisma.riderAssignment.updateMany({
          where: { id: { in: staleAssignments.map((assignment) => assignment.id) } },
          data: { status: "timeout", respondedAt: new Date(), reason: "assignment_expired" },
        }),
        prisma.rider.updateMany({
          where: { id: { in: staleRiderIds }, status: "pending_assignment" },
          data: { status: "available", assignmentExpiresAt: null, currentOrderId: null },
        }),
      ]);
    }

    const pastAssignments = await prisma.riderAssignment.findMany({
      where: { vendorOrderId: vendorOrder.id },
      select: { riderId: true },
    });
    const handledRiderIds = new Set(pastAssignments.map((assignment) => assignment.riderId).filter(Boolean));
    const riders = candidateRiders.filter((rider) => !handledRiderIds.has(rider.id));

    if (!riders.length) {
      return { success: false, reason: "no_new_riders_to_broadcast", riderCount: 0 };
    }

    const statusLog = Array.isArray(vendorOrder.userOrder.statusLog) ? vendorOrder.userOrder.statusLog : [];

    await prisma.$transaction([
      prisma.order.update({
        where: { id: vendorOrder.userOrderId },
        data: {
          riderAssignment: {
            status: "offered",
            assignedAt: new Date().toISOString(),
            acceptedAt: null,
            rejectedAt: null,
            expiresAt: automaticAssignmentExpiresAt.toISOString(),
            lastReason: "",
            assignedBy,
          },
          statusLog: [
            ...statusLog,
            {
              status: "rider_offer_broadcast",
              changedBy: assignedBy ? `admin:${assignedBy}` : "system:auto_assignment",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      }),
      ...riders.map((rider) =>
        prisma.riderAssignment.create({
          data: {
            orderId: vendorOrder.userOrderId,
            vendorOrderId: vendorOrder.id,
            riderId: rider.id,
            vendorId: vendorOrder.restaurantId,
            stateId,
            cityId,
            status: "pending",
            expiresAt: automaticAssignmentExpiresAt,
            metadata: {
              legacyStatus: "offered",
              assignedBy,
              assignedAt: new Date().toISOString(),
              restaurantName: vendorOrder.restaurant?.storeName || "",
              orderReadableId: vendorOrder.userOrder.orderCode || "",
              assignmentMode: "live_job_board",
            },
          },
        })
      ),
    ]);

    return {
      success: true,
      riderCount: riders.length,
      riderIds: riders.map((rider) => rider.legacyMongoId || rider.id),
      notificationContext: {
        orderId: vendorOrder.userOrder.orderCode,
        orderLegacyId: vendorOrder.userOrder.legacyMongoId,
        vendorOrderLegacyId: legacyId(vendorOrder),
        vendorId: vendorOrder.restaurant?.legacyMongoId || vendorOrder.restaurantId,
        vendorName: vendorOrder.restaurant?.storeName || "",
        riderIds: riders.map((rider) => rider.legacyMongoId || rider.id),
        items: vendorOrder.userOrder.items,
        deliveryAddress: vendorOrder.userOrder.deliveryAddress,
        customerName: vendorOrder.userOrder.deliveryAddress?.name || "Customer",
        customerPhone: vendorOrder.userOrder.deliveryAddress?.phone,
        cityId: cityLegacyId,
        stateId: stateLegacyId,
        assignmentExpiresAt: automaticAssignmentExpiresAt,
      },
    };
  },
};
