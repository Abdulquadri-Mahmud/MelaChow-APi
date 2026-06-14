import prisma from "../../config/prisma.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const legacyId = (record) => record?.legacyMongoId || record?.id || null;

const resolveId = async (model, id) => {
  if (!id) return null;
  if (uuidPattern.test(String(id))) return String(id);
  const record = await model.findUnique({
    where: { legacyMongoId: String(id) },
    select: { id: true },
  });
  return record?.id || null;
};

const resolveOwnerId = async (ownerModel, id) => {
  const modelMap = {
    User: prisma.user,
    Vendor: prisma.vendor,
    Rider: prisma.rider,
    Admin: prisma.admin,
  };
  return resolveId(modelMap[ownerModel], id);
};

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

const walletShape = (wallet) => ({
  _id: legacyId(wallet),
  ownerId: wallet.owner?.legacyMongoId || wallet.ownerId,
  ownerModel: wallet.ownerModel,
  balance: wallet.balance,
  totalEarned: wallet.totalEarned,
  totalWithdrawn: wallet.totalWithdrawn,
  transactions: (wallet.transactions || []).map(transactionShape),
  createdAt: wallet.createdAt,
  updatedAt: wallet.updatedAt,
  __v: 0,
});

const walletInclude = {
  transactions: {
    orderBy: { date: "asc" },
    include: {
      order: {
        select: {
          id: true,
          legacyMongoId: true,
        },
      },
    },
  },
};

const getWallet = async (ownerModel, ownerId) => {
  const resolvedOwnerId = await resolveOwnerId(ownerModel, ownerId);
  if (!resolvedOwnerId) return null;

  return prisma.wallet.findUnique({
    where: { ownerId_ownerModel: { ownerId: resolvedOwnerId, ownerModel } },
    include: walletInclude,
  });
};

const withdrawalShape = (withdrawal) => ({
  _id: legacyId(withdrawal),
  vendorId: withdrawal.vendor?.legacyMongoId || withdrawal.vendorId,
  riderId: withdrawal.rider?.legacyMongoId || withdrawal.riderId,
  walletId: withdrawal.wallet?.legacyMongoId || withdrawal.walletId,
  requestedAmount: withdrawal.requestedAmount,
  transferFee: withdrawal.transferFee,
  netAmount: withdrawal.netAmount,
  status: withdrawal.status,
  paystackReference: withdrawal.paystackReference,
  paystackTransferCode: withdrawal.paystackTransferCode,
  bankName: withdrawal.bankName,
  accountNumber: withdrawal.accountNumber,
  accountName: withdrawal.accountName,
  failureReason: withdrawal.failureReason,
  initiatedAt: withdrawal.initiatedAt,
  settledAt: withdrawal.settledAt,
  createdAt: withdrawal.createdAt,
  updatedAt: withdrawal.updatedAt,
  __v: 0,
});

export const walletRepository = {
  async getUserWallet(userId) {
    const wallet = await getWallet("User", userId);
    if (!wallet) {
      return {
        success: true,
        wallet: {
          ownerId: userId,
          ownerModel: "User",
          balance: 0,
          transactions: [],
        },
      };
    }
    return { success: true, wallet: walletShape(wallet) };
  },

  async getRiderWallet(riderId) {
    const wallet = await getWallet("Rider", riderId);
    if (!wallet) {
      return {
        success: true,
        data: {
          ownerId: riderId,
          ownerModel: "Rider",
          balance: 0,
          transactions: [],
        },
      };
    }
    return { success: true, data: walletShape(wallet) };
  },

  async getVendorWallet(vendorId) {
    const resolvedVendorId = await resolveOwnerId("Vendor", vendorId);
    if (!resolvedVendorId) return { success: false, status: 404, message: "Vendor not found" };

    const wallet = await prisma.wallet.findUnique({
      where: { ownerId_ownerModel: { ownerId: resolvedVendorId, ownerModel: "Vendor" } },
      include: walletInclude,
    });

    const aggregate = await prisma.vendorOrder.aggregate({
      where: {
        restaurantId: resolvedVendorId,
        escrowReleased: false,
        orderStatus: { not: "cancelled" },
      },
      _sum: { escrowAmount: true },
    });

    return {
      success: true,
      data: {
        ...(wallet ? walletShape(wallet) : { ownerId: vendorId, ownerModel: "Vendor", balance: 0, transactions: [] }),
        pendingBalance: aggregate._sum.escrowAmount || 0,
      },
    };
  },

  async getVendorPayoutDetails(vendorId) {
    const resolvedVendorId = await resolveOwnerId("Vendor", vendorId);
    if (!resolvedVendorId) return { success: false, status: 404, message: "Vendor not found" };

    const vendor = await prisma.vendor.findUnique({
      where: { id: resolvedVendorId },
      select: { payoutDetails: true },
    });
    const details = vendor?.payoutDetails && typeof vendor.payoutDetails === "object" ? vendor.payoutDetails : null;

    return {
      success: true,
      payoutDetails: details
        ? {
            bankName: details.bankName || "",
            bankCode: details.bankCode || "",
            accountName: details.accountName || "",
            accountNumber: details.accountNumber || "",
            payoutMethod: details.payoutMethod || "paystack",
            payoutEnabled: details.payoutEnabled || false,
          }
        : null,
    };
  },

  async getVendorWithdrawalHistory(vendorId) {
    const resolvedVendorId = await resolveOwnerId("Vendor", vendorId);
    if (!resolvedVendorId) return { withdrawals: [] };

    const withdrawals = await prisma.withdrawal.findMany({
      where: { vendorId: resolvedVendorId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        vendor: { select: { id: true, legacyMongoId: true } },
        wallet: { select: { id: true, legacyMongoId: true } },
      },
    });

    return { withdrawals: withdrawals.map(withdrawalShape) };
  },

  async getRiderWithdrawalHistory(riderId) {
    const resolvedRiderId = await resolveOwnerId("Rider", riderId);
    if (!resolvedRiderId) return { success: true, data: [] };

    const withdrawals = await prisma.riderWithdrawal.findMany({
      where: { riderId: resolvedRiderId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        rider: { select: { id: true, legacyMongoId: true } },
        wallet: { select: { id: true, legacyMongoId: true } },
      },
    });

    return { success: true, data: withdrawals.map(withdrawalShape) };
  },

  async getRiderBankAccount(riderId) {
    const resolvedRiderId = await resolveOwnerId("Rider", riderId);
    if (!resolvedRiderId) return { success: false, status: 404, message: "Rider not found" };

    const rider = await prisma.rider.findUnique({
      where: { id: resolvedRiderId },
      select: { payoutDetails: true },
    });
    const details = rider?.payoutDetails && typeof rider.payoutDetails === "object" ? rider.payoutDetails : {};
    const { bankName, accountNumber, accountName, payoutEnabled } = details;

    return {
      success: true,
      data: { bankName, accountNumber, accountName, payoutEnabled: !!payoutEnabled },
    };
  },
};
