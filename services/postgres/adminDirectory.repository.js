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
};