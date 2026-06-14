import prisma from "../../config/prisma.js";

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
const numberValue = (value) => Number(value || 0);
const parsePage = (value, fallback) => parseInt(value || fallback, 10);
const dateInRange = (date, startDate, endDate) => {
  const value = date ? new Date(date) : null;
  if (!value) return false;
  if (startDate && value < new Date(startDate)) return false;
  if (endDate && value > new Date(endDate)) return false;
  return true;
};

const getPlatformConfig = async () => {
  const config = await prisma.platformConfig.findUnique({ where: { type: "singleton" } });
  return {
    ...defaultPlatformConfig,
    ...(config?.value && typeof config.value === "object" ? config.value : {}),
  };
};

const getAdminWallet = async () =>
  prisma.wallet.findFirst({
    where: { ownerModel: "Admin" },
    include: {
      transactions: {
        orderBy: { date: "asc" },
        include: {
          order: {
            select: {
              id: true,
              legacyMongoId: true,
              orderCode: true,
              orderStatus: true,
              total: true,
            },
          },
        },
      },
    },
  });

const transactionShape = (transaction) => ({
  _id: legacyId(transaction),
  type: transaction.type,
  amount: transaction.amount,
  transactionType: transaction.transactionType,
  description: transaction.description,
  reportingAmount: transaction.reportingAmount,
  orderId: transaction.order?.legacyMongoId || transaction.metadata?.legacyOrderId || transaction.orderId,
  date: transaction.date,
});

const orderMiniShape = (order) =>
  order
    ? {
        _id: legacyId(order),
        orderId: order.orderCode,
        orderStatus: order.orderStatus,
        total: order.total,
      }
    : null;

const userMiniShape = (user) =>
  user
    ? {
        _id: legacyId(user),
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        phone: user.phone,
      }
    : null;

const vendorOrderWithParentWhere = (startDate, endDate) => ({
  userOrder: {
    paymentStatus: "paid",
    ...(startDate || endDate
      ? {
          createdAt: {
            ...(startDate ? { gte: new Date(startDate) } : {}),
            ...(endDate ? { lte: new Date(endDate) } : {}),
          },
        }
      : {}),
  },
});

const orderWhere = ({ startDate, endDate, paymentStatus, search } = {}) => {
  const where = {};
  if (paymentStatus) where.paymentStatus = paymentStatus;
  if (startDate || endDate) {
    where.createdAt = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate) } : {}),
    };
  }
  if (search) {
    where.OR = [
      { orderCode: { contains: search, mode: "insensitive" } },
      { paymentReference: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
    ];
  }
  return where;
};

const getPaymentRecoveryState = (order, vendorOrderCount = 0) => {
  if (!order) return "missing_order";
  if (order.paymentStatus === "paid" && vendorOrderCount > 0) return "fulfilled";
  if (order.paymentStatus === "paid" && vendorOrderCount === 0) return "fulfillment_missing";
  if (order.paymentStatus === "pending" && order.paymentReference) return "awaiting_verification";
  if (order.paymentStatus === "failed") return "failed";
  if (order.paymentStatus === "refunded") return "refunded";
  return "review";
};

const paymentAttemptShape = (attempt) =>
  attempt
    ? (() => {
        const { legacyRecoveryState, legacyOrderId, legacyUserId, ...providerPayload } = attempt.providerPayload || {};
        return {
        _id: legacyId(attempt),
        reference: attempt.reference,
        provider: attempt.provider,
        orderId: attempt.order?.legacyMongoId || attempt.providerPayload?.legacyOrderId || null,
        orderCode: attempt.orderCode,
        userId: attempt.user?.legacyMongoId || attempt.providerPayload?.legacyUserId || null,
        status: attempt.status,
        expectedAmount: Number(attempt.expectedAmount || 0),
        expectedAmountKobo: Number(attempt.expectedAmountKobo || 0),
        paidAmount: Number(attempt.paidAmount || 0),
        paidAmountKobo: Number(attempt.paidAmountKobo || 0),
        currency: attempt.currency,
        providerStatus: attempt.providerStatus,
        gatewayResponse: attempt.gatewayResponse,
        authorizationUrl: attempt.authorizationUrl,
        accessCode: attempt.accessCode,
        failureReason: attempt.failureReason,
        recoveryState: attempt.providerPayload?.legacyRecoveryState || attempt.recoveryState,
        orderSnapshot: attempt.orderSnapshot,
        cartSnapshot: attempt.cartSnapshot,
        providerPayload,
        events: attempt.events,
        createdAt: attempt.createdAt,
        updatedAt: attempt.updatedAt,
        __v: 0,
      };
    })()
    : null;

const orderPaymentShape = (order, vendorOrderCount, paymentAttempt) => ({
  _id: legacyId(order),
  orderId: order.orderCode,
  paymentReference: order.paymentReference,
  paymentStatus: order.paymentStatus,
  orderStatus: order.orderStatus,
  subtotal: order.subtotal,
  deliveryFee: order.deliveryFee,
  serviceFee: order.serviceFee,
  appliedDiscount: order.appliedDiscount,
  freeDeliveryPromo: order.freeDeliveryPromo,
  vendorDeliveryPromo: order.vendorDeliveryPromo,
  total: order.total,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  userId: userMiniShape(order.user),
  phone: order.phone,
  deliveryAddress: order.deliveryAddress,
  items: (order.items || []).map((item) => ({
    _id: legacyId(item),
    type: item.type,
    foodId: item.metadata?.legacyFoodId || item.foodId,
    portionId: item.metadata?.legacyPortionId || item.portionId,
    variantId: item.metadata?.legacyVariantId || item.variantId,
    restaurantId: item.metadata?.legacyRestaurantId || item.restaurantId,
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
    selected_options: item.selectedOptions,
    metadata: item.metadata,
  })),
  vendorDeliveryFees: (order.vendorDeliveryFees || []).map((fee) => ({
    restaurantId: fee.restaurant?.legacyMongoId || fee.restaurantId,
    deliveryFee: fee.deliveryFee,
  })),
  riderId: order.rider?.legacyMongoId || order.riderId,
  riderAssignment: order.riderAssignment,
  riderEarnings: order.riderEarnings,
  statusLog: order.statusLog,
  idempotencyKey: order.idempotencyKey,
  vendorOrderCount,
  paymentAttempt: paymentAttemptShape(paymentAttempt),
  recoveryState: paymentAttempt?.recoveryState === "review" ? "review" : getPaymentRecoveryState(order, vendorOrderCount),
  __v: 0,
});

export const adminFinanceRepository = {
  async getRevenueSummary({ startDate, endDate } = {}) {
    const platformConfig = await getPlatformConfig();
    const [vendorOrders, paidOrders, adminWallet] = await Promise.all([
      prisma.vendorOrder.findMany({
        where: vendorOrderWithParentWhere(startDate, endDate),
        include: { userOrder: true },
      }),
      prisma.order.findMany({
        where: orderWhere({ startDate, endDate, paymentStatus: "paid" }),
      }),
      getAdminWallet(),
    ]);

    const adminTransactions = (adminWallet?.transactions || []).map(transactionShape).filter((tx) => dateInRange(tx.date, startDate, endDate));
    const totalEscrowHeld = vendorOrders.filter((order) => !order.escrowReleased).reduce((sum, order) => sum + numberValue(order.escrowAmount), 0);
    const totalCommissionEarned = vendorOrders.reduce((sum, order) => sum + numberValue(order.commission), 0);
    const totalPlatformDeliveryRevenue = adminTransactions
      .filter((tx) => tx.transactionType === "delivery_spread")
      .reduce((sum, tx) => sum + numberValue(tx.reportingAmount), 0);
    const totalServiceFeeRevenue = adminTransactions
      .filter((tx) => tx.transactionType === "service_fee" && tx.type === "credit")
      .reduce((sum, tx) => sum + numberValue(tx.amount), 0);
    const totalCredits = adminTransactions.filter((tx) => tx.type === "credit").reduce((sum, tx) => sum + numberValue(tx.amount), 0);
    const totalDebits = adminTransactions.filter((tx) => tx.type === "debit").reduce((sum, tx) => sum + numberValue(tx.amount), 0);
    const currentPlatformBalance = adminWallet?.balance || 0;

    return {
      success: true,
      data: {
        currentPlatformBalance,
        totalEscrowHeld,
        availableBalance: Math.max(0, currentPlatformBalance - totalEscrowHeld),
        totalCommissionEarned,
        totalDeliverySpreadEarned: totalPlatformDeliveryRevenue,
        totalServiceFeeRevenue,
        combinedPlatformRevenue: totalCommissionEarned + totalPlatformDeliveryRevenue + totalServiceFeeRevenue,
        totalOrderRevenue: paidOrders.reduce((sum, order) => sum + numberValue(order.total), 0),
        totalDeliveryFeesCollected: paidOrders.reduce((sum, order) => sum + numberValue(order.deliveryFee), 0),
        totalServiceFeesCollected: paidOrders.reduce((sum, order) => sum + numberValue(order.serviceFee), 0),
        totalCredits,
        totalDebits,
        period: { startDate, endDate },
        revenueModel: {
          commissionRate: platformConfig.commissionEnabled ? `${platformConfig.commissionRate}% (enabled)` : "0% (disabled)",
          spreadPerOrder: `?${1000 - platformConfig.riderFixedPayout} (approx - varies by city fee)`,
          riderPayout: `?${platformConfig.riderFixedPayout} fixed per platform delivery`,
          serviceFee: platformConfig.serviceFeeEnabled
            ? `${platformConfig.serviceFeeType === "fixed" ? "?" + platformConfig.serviceFeeValue : platformConfig.serviceFeeValue + "%"} (max ?${platformConfig.serviceFeeCap})`
            : "Disabled",
        },
      },
    };
  },

  async getRevenueChart({ period = "7days" } = {}) {
    const platformConfig = await getPlatformConfig();
    const daysToLookBack = period === "30days" ? 30 : period === "90days" || period === "3months" ? 90 : period === "12months" ? 365 : 7;
    const groupType = period === "90days" || period === "3months" ? "week" : period === "12months" ? "month" : "day";
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysToLookBack);
    const vendorOrders = await prisma.vendorOrder.findMany({
      where: { createdAt: { gte: startDate }, userOrder: { paymentStatus: "paid" } },
      include: { userOrder: true },
    });

    const bucket = (date) => {
      const d = new Date(date);
      if (groupType === "month") return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      if (groupType === "week") return `${d.getUTCFullYear()}-W${Math.ceil((((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7)}`;
      return d.toISOString().slice(0, 10);
    };

    const rows = new Map();
    for (const vendorOrder of vendorOrders) {
      const label = bucket(vendorOrder.createdAt);
      const current = rows.get(label) || { label, commission: 0, deliveryRevenue: 0, serviceFeeRevenue: 0, globalGMV: 0, totalRevenue: 0, orderCount: new Set() };
      const deliveryRevenue = Math.max(0, numberValue(vendorOrder.userOrder.deliveryFee) - numberValue(vendorOrder.userOrder.riderEarnings || platformConfig.riderFixedPayout));
      current.commission += numberValue(vendorOrder.commission);
      current.deliveryRevenue += deliveryRevenue;
      current.serviceFeeRevenue += numberValue(vendorOrder.userOrder.serviceFee);
      current.globalGMV += numberValue(vendorOrder.userOrder.total);
      current.totalRevenue += numberValue(vendorOrder.commission) + deliveryRevenue + numberValue(vendorOrder.userOrder.serviceFee);
      current.orderCount.add(vendorOrder.userOrderId);
      rows.set(label, current);
    }

    return {
      success: true,
      data: {
        period,
        chart: [...rows.values()]
          .map((row) => ({ ...row, orderCount: row.orderCount.size }))
          .sort((left, right) => left.label.localeCompare(right.label)),
      },
    };
  },

  async getTransactionLedger({ type, transactionType, startDate, endDate, search, page = 1, limit = 25 } = {}) {
    const pageNumber = parsePage(page, 1);
    const limitNumber = parsePage(limit, 25);
    const wallet = await getAdminWallet();
    if (!wallet) {
      return { success: true, data: { transactions: [], pagination: { total: 0, page, limit, totalPages: 0 } } };
    }

    let running = 0;
    let transactions = wallet.transactions
      .map(transactionShape)
      .filter((tx) => tx.amount > 0)
      .sort((left, right) => new Date(left.date) - new Date(right.date))
      .map((tx) => {
        running += tx.type === "credit" ? tx.amount : -tx.amount;
        return { ...tx, runningBalance: Number(running.toFixed(2)) };
      });

    if (type && type !== "all") transactions = transactions.filter((tx) => tx.type === type);
    if (transactionType && transactionType !== "all") transactions = transactions.filter((tx) => tx.transactionType === transactionType);
    if (startDate || endDate) transactions = transactions.filter((tx) => dateInRange(tx.date, startDate, endDate));
    if (search) {
      const orderMatches = await prisma.order.findMany({
        where: { orderCode: { contains: search, mode: "insensitive" } },
        select: { legacyMongoId: true },
      });
      const orderIds = new Set(orderMatches.map((order) => order.legacyMongoId));
      const s = search.toLowerCase();
      transactions = transactions.filter((tx) => tx.description?.toLowerCase().includes(s) || orderIds.has(String(tx.orderId)));
    }

    transactions.sort((left, right) => new Date(right.date) - new Date(left.date));
    const total = transactions.length;
    const pageSlice = transactions.slice((pageNumber - 1) * limitNumber, pageNumber * limitNumber);
    const orders = await prisma.order.findMany({
      where: { legacyMongoId: { in: pageSlice.map((tx) => String(tx.orderId)).filter(Boolean) } },
      select: { id: true, legacyMongoId: true, orderCode: true, orderStatus: true, total: true },
    });
    const orderMap = Object.fromEntries(orders.map((order) => [order.legacyMongoId, orderMiniShape(order)]));

    return {
      success: true,
      data: {
        transactions: pageSlice.map((tx) => ({ ...tx, order: tx.orderId ? orderMap[String(tx.orderId)] || null : null })),
        pagination: { total, page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) },
        walletSummary: {
          currentBalance: wallet.balance,
          totalCredited: wallet.transactions.filter((tx) => tx.type === "credit" && tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0),
          totalDebited: wallet.transactions.filter((tx) => tx.type === "debit" && tx.amount > 0).reduce((sum, tx) => sum + tx.amount, 0),
        },
      },
    };
  },

  async getVendorBreakdown({ startDate, endDate, page = 1, limit = 20 } = {}) {
    const pageNumber = parsePage(page, 1);
    const limitNumber = parsePage(limit, 20);
    const platformConfig = await getPlatformConfig();
    const vendorOrders = await prisma.vendorOrder.findMany({
      where: vendorOrderWithParentWhere(startDate, endDate),
      include: { userOrder: true, restaurant: { select: { id: true, legacyMongoId: true, storeName: true } } },
    });
    const rows = new Map();
    for (const vendorOrder of vendorOrders) {
      const vendorId = legacyId(vendorOrder.restaurant);
      const current = rows.get(vendorId) || {
        _id: vendorId,
        vendorId,
        storeName: vendorOrder.restaurant.storeName,
        orderCount: 0,
        totalSubtotal: 0,
        commissionPaid: 0,
        vendorEarnings: 0,
        deliveryShareGenerated: 0,
      };
      current.orderCount += 1;
      current.commissionPaid += numberValue(vendorOrder.commission);
      current.vendorEarnings += numberValue(vendorOrder.vendorTotal);
      current.deliveryShareGenerated += Math.max(0, numberValue(vendorOrder.userOrder.deliveryFee) - numberValue(vendorOrder.userOrder.riderEarnings || platformConfig.riderFixedPayout));
      current.totalSubtotal += numberValue(vendorOrder.commission) + numberValue(vendorOrder.vendorTotal);
      rows.set(vendorId, current);
    }
    const vendors = [...rows.values()].sort((left, right) => right.orderCount - left.orderCount);
    const total = vendors.length;

    return {
      success: true,
      data: {
        vendors: vendors.slice((pageNumber - 1) * limitNumber, pageNumber * limitNumber),
        pagination: { total, page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) },
        totals: {
          _id: null,
          totalCommission: vendors.reduce((sum, row) => sum + row.commissionPaid, 0),
          totalVendorEarnings: vendors.reduce((sum, row) => sum + row.vendorEarnings, 0),
          totalDeliveryShare: vendors.reduce((sum, row) => sum + row.deliveryShareGenerated, 0),
        },
      },
    };
  },

  async getUnreleasedEscrowList({ page = 1, limit = 20, search, startDate, endDate } = {}) {
    const pageNumber = parsePage(page, 1);
    const limitNumber = parsePage(limit, 20);
    const where = {
      escrowReleased: false,
      userOrder: {
        paymentStatus: "paid",
        ...(search ? { orderCode: { contains: search, mode: "insensitive" } } : {}),
        ...(startDate || endDate
          ? { createdAt: { ...(startDate ? { gte: new Date(startDate) } : {}), ...(endDate ? { lte: new Date(endDate) } : {}) } }
          : {}),
      },
    };
    const [total, rows] = await Promise.all([
      prisma.vendorOrder.count({ where }),
      prisma.vendorOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (pageNumber - 1) * limitNumber,
        take: limitNumber,
        include: {
          userOrder: { select: { legacyMongoId: true, orderCode: true, total: true, paymentStatus: true } },
          restaurant: { select: { legacyMongoId: true, storeName: true } },
        },
      }),
    ]);
    const all = await prisma.vendorOrder.findMany({ where, select: { escrowAmount: true } });

    return {
      success: true,
      data: {
        escrowOrders: rows.map((row) => ({
          _id: legacyId(row),
          escrowAmount: row.escrowAmount,
          orderStatus: row.orderStatus,
          createdAt: row.createdAt,
          parentOrder: {
            orderId: row.userOrder.orderCode,
            total: row.userOrder.total,
            paymentStatus: row.userOrder.paymentStatus,
          },
          vendorInfo: {
            _id: row.restaurant.legacyMongoId,
            storeName: row.restaurant.storeName,
          },
        })),
        totalEscrowHeld: all.reduce((sum, row) => sum + numberValue(row.escrowAmount), 0),
        pagination: { total, page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) },
      },
    };
  },

  async getRefundsList({ page = 1, limit = 20, search, startDate, endDate } = {}) {
    const pageNumber = parsePage(page, 1);
    const limitNumber = parsePage(limit, 20);
    const where = {
      ...(startDate || endDate
        ? { createdAt: { ...(startDate ? { gte: new Date(startDate) } : {}), ...(endDate ? { lte: new Date(endDate) } : {}) } }
        : {}),
      ...(search
        ? {
            OR: [
              { reason: { contains: search, mode: "insensitive" } },
              { order: { orderCode: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const [total, refunds] = await Promise.all([
      prisma.refund.count({ where }),
      prisma.refund.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (pageNumber - 1) * limitNumber,
        take: limitNumber,
        include: {
          order: { select: { id: true, legacyMongoId: true, orderCode: true, total: true, paymentStatus: true } },
          user: { select: { id: true, legacyMongoId: true, email: true, firstname: true, lastname: true } },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        refunds: refunds.map((refund) => ({
          _id: legacyId(refund),
          orderId: refund.order ? { _id: legacyId(refund.order), orderId: refund.order.orderCode, total: refund.order.total, paymentStatus: refund.order.paymentStatus } : refund.metadata?.legacyOrderId || null,
          userId: refund.user ? { _id: legacyId(refund.user), email: refund.user.email, firstname: refund.user.firstname, lastname: refund.user.lastname } : refund.metadata?.legacyUserId || null,
          amount: Number(refund.amount || 0) / 100,
          reason: refund.reason,
          status: refund.metadata?.legacyStatus || refund.status,
          originalTotal: refund.metadata?.originalTotal,
          commissionRetained: refund.metadata?.commissionRetained,
          orderStatusAtCancellation: refund.metadata?.orderStatusAtCancellation,
          notes: refund.metadata?.notes,
          createdAt: refund.createdAt,
          updatedAt: refund.updatedAt,
          __v: 0,
        })),
        pagination: { total, page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) },
      },
    };
  },

  async getPaymentRecoveryList({ search, status = "all", page = 1, limit = 25, startDate, endDate } = {}) {
    const pageNumber = parsePage(page, 1);
    const limitNumber = parsePage(limit, 25);
    const paymentStatus = ["pending", "paid", "failed", "refunded"].includes(status) ? status : null;
    const where = orderWhere({ startDate, endDate, search, paymentStatus });
    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (pageNumber - 1) * limitNumber,
        take: limitNumber,
        include: {
          user: { select: { id: true, legacyMongoId: true, firstname: true, lastname: true, email: true, phone: true } },
          vendorOrders: { select: { id: true } },
          items: true,
          vendorDeliveryFees: { include: { restaurant: { select: { legacyMongoId: true } } } },
          rider: { select: { legacyMongoId: true } },
        },
      }),
    ]);
    const attempts = await prisma.paymentAttempt.findMany({
      where: {
        OR: [
          { orderId: { in: orders.map((order) => order.id) } },
          { reference: { in: orders.map((order) => order.paymentReference).filter(Boolean) } },
        ],
      },
      include: { order: { select: { legacyMongoId: true } }, user: { select: { legacyMongoId: true } } },
    });
    const attemptMap = attempts.reduce((acc, attempt) => {
      if (attempt.orderId) acc[attempt.orderId] = attempt;
      if (attempt.reference) acc[attempt.reference] = attempt;
      return acc;
    }, {});

    let payments = orders.map((order) => orderPaymentShape(order, order.vendorOrders.length, attemptMap[order.id] || attemptMap[order.paymentReference] || null));
    if (["awaiting_verification", "fulfillment_missing", "fulfilled", "review", "missing_order"].includes(status)) {
      payments = payments.filter((order) => order.recoveryState === status);
    }

    const [allOrders, vendorOrderParents, attemptStatusRows] = await Promise.all([
      prisma.order.findMany({ where: orderWhere({ startDate, endDate }), select: { id: true, paymentStatus: true, total: true } }),
      prisma.vendorOrder.findMany({ select: { userOrderId: true } }),
      prisma.paymentAttempt.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    const byPaymentStatus = allOrders.reduce((acc, order) => {
      const key = order.paymentStatus || "unknown";
      acc[key] ||= { count: 0, amount: 0 };
      acc[key].count += 1;
      acc[key].amount += numberValue(order.total);
      return acc;
    }, {});
    const parentIds = new Set(vendorOrderParents.map((entry) => entry.userOrderId));

    return {
      success: true,
      data: {
        payments,
        summary: {
          byPaymentStatus,
          paidMissingFulfillment: allOrders.filter((order) => order.paymentStatus === "paid" && !parentIds.has(order.id)).length,
          byAttemptStatus: attemptStatusRows.reduce((acc, row) => {
            acc[row.status || "unknown"] = row._count._all;
            return acc;
          }, {}),
        },
        pagination: { total, page: pageNumber, limit: limitNumber, totalPages: Math.ceil(total / limitNumber) },
      },
    };
  },
};
