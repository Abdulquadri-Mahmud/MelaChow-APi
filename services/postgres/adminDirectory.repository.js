import prisma from "../../config/prisma.js";
import { koboToNaira } from "../../utils/moneyContract.js";

const legacyId = (row) => row?.legacyMongoId || row?.id || null;
const publicRow = (row) => {
  if (!row) return null;
  const { password, resetPasswordToken, resetPasswordExpires, passwordSetupToken, passwordSetupExpires, otp, otpExpires, loginOtpHash, loginOtpExpires, ...safe } = row;
  return { ...safe, _id: legacyId(row), id: legacyId(row), __v: 0 };
};
const walletShape = (wallet) => wallet ? {
  ...wallet,
  _id: legacyId(wallet),
  id: legacyId(wallet),
  balance: koboToNaira(wallet.balance),
  totalEarned: koboToNaira(wallet.totalEarned),
  totalWithdrawn: koboToNaira(wallet.totalWithdrawn),
moneyUnit: "naira",
  ...(Array.isArray(wallet.transactions) ? {
    transactions: wallet.transactions.map((tx) => ({
      ...tx,
      _id: legacyId(tx),
      id: legacyId(tx),
      amount: koboToNaira(tx.amount),
      reportingAmount: tx.reportingAmount == null ? null : koboToNaira(tx.reportingAmount),
      moneyUnit: "naira",
    })),
  } : {}),
} : null;
const walletsByOwner = async (ownerModel, ownerIds) => {
  if (!ownerIds.length) return new Map();
  const wallets = await prisma.wallet.findMany({ where: { ownerModel, ownerId: { in: ownerIds } } });
  return new Map(wallets.map((wallet) => [wallet.ownerId, walletShape(wallet)]));
};
const resolve = async (model, token) => {
  const value = String(token || "");
  if (!value) return null;
  return model.findFirst({ where: { OR: [{ legacyMongoId: value }, ...(value.length === 36 ? [{ id: value }] : [])] } });
};

export const adminDirectoryRepository = {
  async listUsers(query = {}) {
    const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 5), 100);
    const where = {};
    if (query.verified !== undefined) where.isVerified = query.verified === "true";
    if (query.suspended !== undefined) where.suspended = query.suspended === "true";
    if (query.banned !== undefined) where.banned = query.banned === "true";
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (query.customerAge === "today") { const today = new Date(); today.setHours(0, 0, 0, 0); where.createdAt = { gte: today }; }
    else if (query.customerAge === "new") where.createdAt = { gte: thirtyDaysAgo };
    else if (query.customerAge === "existing") where.createdAt = { lt: thirtyDaysAgo };
    if (query.search) where.OR = ["firstname", "lastname", "fullName", "email", "phone"].map((field) => ({ [field]: { contains: String(query.search).trim(), mode: "insensitive" } }));
    const [rows, total] = await Promise.all([
      prisma.user.findMany({ where, include: { _count: { select: { orders: true } } }, orderBy: [{ createdAt: query.sort === "oldest" ? "asc" : "desc" }, { id: query.sort === "oldest" ? "asc" : "desc" }], skip: (page - 1) * limit, take: limit }),
      prisma.user.count({ where }),
    ]);
    const wallets = await walletsByOwner("User", rows.map((row) => row.id));
    const users = rows.map((row) => { const shaped = publicRow(row); delete shaped._count; return { ...shaped, wallet: wallets.get(row.id) || null, walletBalance: koboToNaira(row.walletBalance), orderCount: row._count.orders, moneyUnit: "naira" }; });
    const totalPages = Math.max(Math.ceil(total / limit), 1);
    return { success: true, count: users.length, total, page, limit, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1, users };
  },

  async getUser(token) {
    const row = await resolve(prisma.user, token);
    if (!row) return null;
    const [wallet, orderCount] = await Promise.all([prisma.wallet.findUnique({ where: { ownerId_ownerModel: { ownerId: row.id, ownerModel: "User" } } }), prisma.order.count({ where: { userId: row.id } })]);
    return { ...publicRow(row), wallet: walletShape(wallet), walletBalance: koboToNaira(row.walletBalance), orderCount, moneyUnit: "naira" };
  },

  async userStats() {
    const [totalUsers, verifiedUsers, suspendedUsers, bannedUsers] = await Promise.all([prisma.user.count(), prisma.user.count({ where: { isVerified: true } }), prisma.user.count({ where: { suspended: true } }), prisma.user.count({ where: { banned: true } })]);
    return { success: true, stats: { totalUsers, verifiedUsers, suspendedUsers, bannedUsers } };
  },

  async listVendors(query = {}) {
    const where = { deletedAt: null };
    if (query.verified !== undefined) where.verified = query.verified === "true";
    if (query.suspended !== undefined) where.suspended = query.suspended === "true";
    if (query.active !== undefined) where.active = query.active === "true";
    if (query.isApproved !== undefined) where.isApproved = query.isApproved === "true";
    if (query.search) where.OR = ["storeName", "email", "phone"].map((field) => ({ [field]: { contains: String(query.search).trim(), mode: "insensitive" } }));
    const rows = await prisma.vendor.findMany({ where, include: { _count: { select: { menuItems: true, legacyFoods: true } } }, orderBy: { createdAt: "desc" } });
    const wallets = await walletsByOwner("Vendor", rows.map((row) => row.id));
    const vendors = rows.map((row) => { const shaped = publicRow(row); delete shaped._count; return { ...shaped, wallet: wallets.get(row.id) || null, totalSales: koboToNaira(row.totalSales), flatRateDeliveryFee: koboToNaira(row.flatRateDeliveryFee), platformDeliveryFeeOverride: row.platformDeliveryFeeOverride == null ? null : koboToNaira(row.platformDeliveryFeeOverride), foods: Array(row._count.menuItems + row._count.legacyFoods).fill(null), moneyUnit: "naira" }; });
    return { success: true, count: vendors.length, vendors };
  },
  async getVendor(token) {
    const vendor = await resolve(prisma.vendor, token);
    if (!vendor || vendor.deletedAt) return null;
    const [wallet, menuItems, foods, comboItems, vendorOrders, withdrawals] = await Promise.all([
      prisma.wallet.findUnique({ where: { ownerId_ownerModel: { ownerId: vendor.id, ownerModel: "Vendor" } }, include: { transactions: { orderBy: { date: "desc" } } } }),
      prisma.menuItem.findMany({ where: { vendorId: vendor.id }, include: { portions: true }, orderBy: { createdAt: "desc" } }),
      prisma.food.findMany({ where: { vendorId: vendor.id }, orderBy: { createdAt: "desc" } }),
      prisma.comboItem.findMany({ where: { vendorId: vendor.id }, orderBy: { createdAt: "desc" } }),
      prisma.vendorOrder.findMany({ where: { restaurantId: vendor.id }, include: { userOrder: { select: { legacyMongoId: true, orderCode: true, paymentStatus: true, total: true, createdAt: true } } }, orderBy: { updatedAt: "desc" } }),
      prisma.withdrawal.findMany({ where: { vendorId: vendor.id } }),
    ]);
    const completedStatuses = new Set(["delivered", "completed"]), activeStatuses = new Set(["accepted", "preparing", "ready_for_pickup", "rider_assigned", "out_for_delivery"]);
    const completed = vendorOrders.filter((row) => completedStatuses.has(row.orderStatus));
    const active = vendorOrders.filter((row) => activeStatuses.has(row.orderStatus));
    const cancelled = vendorOrders.filter((row) => row.orderStatus === "cancelled");
    const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
    const paidWithdrawals = withdrawals.filter((row) => row.status === "completed"), pendingWithdrawals = withdrawals.filter((row) => ["pending", "processing"].includes(row.status));
    const shaped = publicRow(vendor);
    return {
      ...shaped,
      hasPassword: Boolean(vendor.password),
      payoutDetails: vendor.payoutDetails || null,
      wallet: walletShape(wallet),
      totalSales: koboToNaira(vendor.totalSales),
      flatRateDeliveryFee: koboToNaira(vendor.flatRateDeliveryFee),
      platformDeliveryFeeOverride: vendor.platformDeliveryFeeOverride == null ? null : koboToNaira(vendor.platformDeliveryFeeOverride),
      foods: foods.map((food) => ({ ...publicRow(food), image_url: Array.isArray(food.images) ? food.images[0] : null, price: koboToNaira(food.price), packagingFee: koboToNaira(food.packagingFee), moneyUnit: "naira" })),
      menuItems: menuItems.map((item) => ({ ...publicRow(item), image_url: item.imageUrl, is_available: item.isAvailable, portions: item.portions.map((portion) => ({ ...publicRow(portion), price: koboToNaira(portion.price) })), moneyUnit: "naira" })),
      comboItems: comboItems.map((item) => ({ ...publicRow(item), image_url: item.imageUrl, is_available: item.isAvailable, price: koboToNaira(item.price), moneyUnit: "naira" })),
      adminOverview: {
        totalOrders: vendorOrders.length,
        completedOrders: completed.length,
        activeOrders: active.length,
        cancelledOrders: cancelled.length,
        grossSales: koboToNaira(vendorOrders.reduce((total, row) => total + Number(row.vendorTotal || 0) + Number(row.commission || 0), 0)),
        commission: koboToNaira(sum(vendorOrders, "commission")),
        escrowHeld: koboToNaira(sum(vendorOrders.filter((row) => !row.escrowReleased), "escrowAmount")),
        escrowReleased: koboToNaira(sum(vendorOrders.filter((row) => row.escrowReleased), "escrowAmount")),
        walletBalance: koboToNaira(wallet?.balance),
        paidOut: koboToNaira(sum(paidWithdrawals, "netAmount")),
        pendingPayout: koboToNaira(Number(wallet?.balance || 0) + sum(pendingWithdrawals, "requestedAmount")),
        inFlightPayout: koboToNaira(sum(pendingWithdrawals, "requestedAmount")),
        payoutCount: paidWithdrawals.length,
        recentOrders: vendorOrders.slice(0, 5).map((row) => ({ ...publicRow(row), vendorTotal: koboToNaira(row.vendorTotal), escrowAmount: koboToNaira(row.escrowAmount), userOrderId: row.userOrder ? { ...publicRow(row.userOrder), orderId: row.userOrder.orderCode, total: koboToNaira(row.userOrder.total) } : null, moneyUnit: "naira" })),
        historySource: "vendor_orders",
      },
      moneyUnit: "naira",
    };
  },
};