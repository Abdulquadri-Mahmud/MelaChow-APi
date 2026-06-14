import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import Wallet from "../model/wallet/wallet.mode.js";
import Withdrawal from "../model/wallet/Withdrawal.model.js";
import RiderWithdrawal from "../model/wallet/RiderWithdrawal.model.js";

const stats = {
  wallets: 0,
  walletTransactions: 0,
  withdrawals: 0,
  riderWithdrawals: 0,
  skipped: [],
};

const toLegacyId = (value) => (value ? String(value) : null);
const asDate = (value) => (value ? new Date(value) : undefined);

const parseArgs = () => {
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has("--dry-run"),
    limit: Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 0),
  };
};

const write = async (label, action, dryRun) => {
  if (dryRun) return null;
  try {
    return await action();
  } catch (error) {
    error.message = `${label}: ${error.message}`;
    throw error;
  }
};

const resolveOwnerId = async (ownerModel, mongoId) => {
  if (!mongoId) return null;
  const modelMap = {
    Admin: prisma.admin,
    Vendor: prisma.vendor,
    User: prisma.user,
    Rider: prisma.rider,
  };
  const model = modelMap[ownerModel];
  if (!model) return null;
  const owner = await model.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return owner?.id || null;
};

const resolveOrderId = async (mongoId) => {
  if (!mongoId) return null;
  const order = await prisma.order.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return order?.id || null;
};

const mapTransactionType = (value) =>
  [
    "commission",
    "escrow_hold",
    "escrow_release",
    "delivery_fee",
    "rider_payout",
    "delivery_spread",
    "service_fee",
    "refund",
    "order_payment",
    "top_up",
    "manual_credit",
    "manual_debit",
    "withdrawal",
  ].includes(value)
    ? value
    : null;

const importWalletTransactions = async ({ wallet, walletId, dryRun }) => {
  const transactions = Array.isArray(wallet.transactions) ? wallet.transactions : [];

  for (const transaction of transactions) {
    const orderId = await resolveOrderId(transaction.orderId);
    const data = {
      legacyMongoId: toLegacyId(transaction._id),
      walletId,
      type: transaction.type === "debit" ? "debit" : "credit",
      amount: transaction.amount || 0,
      transactionType: mapTransactionType(transaction.transactionType),
      description: transaction.description || null,
      reportingAmount: transaction.reportingAmount ?? null,
      orderId,
      date: asDate(transaction.date) || new Date(),
      metadata: {
        legacyOrderId: toLegacyId(transaction.orderId),
      },
      createdAt: asDate(transaction.date) || asDate(wallet.createdAt),
      updatedAt: asDate(wallet.updatedAt),
    };

    await write(
      `walletTransaction ${transaction._id || `${wallet._id}:${stats.walletTransactions}`}`,
      () =>
        prisma.walletTransaction.upsert({
          where: { legacyMongoId: data.legacyMongoId || `${wallet.legacyMongoId}:${stats.walletTransactions}` },
          create: data,
          update: data,
        }),
      dryRun
    );
    stats.walletTransactions += 1;
  }
};

const importWallets = async (dryRun, limit) => {
  const query = Wallet.find({}).sort({ createdAt: 1 });
  if (limit) query.limit(limit);
  const wallets = await query.lean();

  for (const wallet of wallets) {
    const ownerId = await resolveOwnerId(wallet.ownerModel, wallet.ownerId);
    if (!ownerId) {
      stats.skipped.push(`wallet:${wallet._id}: missing ${wallet.ownerModel} owner ${wallet.ownerId}`);
      continue;
    }

    const data = {
      legacyMongoId: toLegacyId(wallet._id),
      ownerId,
      ownerModel: wallet.ownerModel,
      balance: wallet.balance || 0,
      totalEarned: wallet.totalEarned || 0,
      totalWithdrawn: wallet.totalWithdrawn || 0,
      createdAt: asDate(wallet.createdAt),
      updatedAt: asDate(wallet.updatedAt),
    };

    const savedWallet = await write(
      `wallet ${wallet._id}`,
      () =>
        prisma.wallet.upsert({
          where: { ownerId_ownerModel: { ownerId, ownerModel: wallet.ownerModel } },
          create: data,
          update: data,
        }),
      dryRun
    );
    if (!dryRun && savedWallet) {
      await importWalletTransactions({ wallet, walletId: savedWallet.id, dryRun });
    }
    stats.wallets += 1;
  }
};

const importVendorWithdrawals = async (dryRun, limit) => {
  const query = Withdrawal.find({}).sort({ createdAt: 1 });
  if (limit) query.limit(limit);
  const withdrawals = await query.lean();

  for (const withdrawal of withdrawals) {
    const vendorId = await resolveOwnerId("Vendor", withdrawal.vendorId);
    const wallet = await prisma.wallet.findUnique({
      where: { legacyMongoId: toLegacyId(withdrawal.walletId) },
      select: { id: true },
    });
    if (!vendorId || !wallet) {
      stats.skipped.push(`withdrawal:${withdrawal._id}: missing vendor/wallet`);
      continue;
    }

    const data = {
      legacyMongoId: toLegacyId(withdrawal._id),
      vendorId,
      walletId: wallet.id,
      requestedAmount: withdrawal.requestedAmount || 0,
      transferFee: withdrawal.transferFee || 0,
      netAmount: withdrawal.netAmount || 0,
      status: withdrawal.status || "pending",
      paystackReference: withdrawal.paystackReference,
      paystackTransferCode: withdrawal.paystackTransferCode || null,
      recipientCode: withdrawal.recipientCode || "",
      bankName: withdrawal.bankName || "",
      accountNumber: withdrawal.accountNumber || "",
      accountName: withdrawal.accountName || "",
      failureReason: withdrawal.failureReason || null,
      initiatedAt: asDate(withdrawal.initiatedAt),
      settledAt: asDate(withdrawal.settledAt),
      createdAt: asDate(withdrawal.createdAt),
      updatedAt: asDate(withdrawal.updatedAt),
    };

    await write(
      `withdrawal ${withdrawal._id}`,
      () =>
        prisma.withdrawal.upsert({
          where: { legacyMongoId: data.legacyMongoId },
          create: data,
          update: data,
        }),
      dryRun
    );
    stats.withdrawals += 1;
  }
};

const importRiderWithdrawals = async (dryRun, limit) => {
  const query = RiderWithdrawal.find({}).sort({ createdAt: 1 });
  if (limit) query.limit(limit);
  const withdrawals = await query.lean();

  for (const withdrawal of withdrawals) {
    const riderId = await resolveOwnerId("Rider", withdrawal.riderId);
    const wallet = await prisma.wallet.findUnique({
      where: { legacyMongoId: toLegacyId(withdrawal.walletId) },
      select: { id: true },
    });
    if (!riderId || !wallet) {
      stats.skipped.push(`riderWithdrawal:${withdrawal._id}: missing rider/wallet`);
      continue;
    }

    const data = {
      legacyMongoId: toLegacyId(withdrawal._id),
      riderId,
      walletId: wallet.id,
      requestedAmount: withdrawal.requestedAmount || 0,
      transferFee: withdrawal.transferFee || 0,
      netAmount: withdrawal.netAmount || 0,
      status: withdrawal.status || "pending",
      paystackReference: withdrawal.paystackReference,
      paystackTransferCode: withdrawal.paystackTransferCode || null,
      recipientCode: withdrawal.recipientCode || "",
      bankName: withdrawal.bankName || "",
      accountNumber: withdrawal.accountNumber || "",
      accountName: withdrawal.accountName || "",
      failureReason: withdrawal.failureReason || null,
      initiatedAt: asDate(withdrawal.initiatedAt),
      settledAt: asDate(withdrawal.settledAt),
      createdAt: asDate(withdrawal.createdAt),
      updatedAt: asDate(withdrawal.updatedAt),
    };

    await write(
      `riderWithdrawal ${withdrawal._id}`,
      () =>
        prisma.riderWithdrawal.upsert({
          where: { legacyMongoId: data.legacyMongoId },
          create: data,
          update: data,
        }),
      dryRun
    );
    stats.riderWithdrawals += 1;
  }
};

const importAll = async () => {
  const { dryRun, limit } = parseArgs();

  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  await mongoose.connect(process.env.MONGO_URI);

  try {
    await importWallets(dryRun, limit);
    await importVendorWithdrawals(dryRun, limit);
    await importRiderWithdrawals(dryRun, limit);
    console.log(JSON.stringify({ dryRun, stats }, null, 2));
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

importAll().catch(async (error) => {
  console.error("Mongo to Postgres wallet import failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
