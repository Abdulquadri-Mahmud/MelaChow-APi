import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import PaymentAttempt from "../model/order/PaymentAttempt.js";
import PaymentLock from "../model/order/PaymentLock.js";
import Refund from "../model/refund.model.js";
import Transaction from "../model/transacrion/transaction.models.js";
import Invoice from "../model/invoice.model.js";

const stats = {
  paymentAttempts: 0,
  paymentLocks: 0,
  refunds: 0,
  transactions: 0,
  invoices: 0,
  skipped: [],
};

const toLegacyId = (value) => (value ? String(value) : null);
const asDate = (value) => (value ? new Date(value) : undefined);
const toKobo = (amount, koboAmount) => {
  if (Number.isFinite(Number(koboAmount)) && Number(koboAmount) > 0) return Math.round(Number(koboAmount));
  return Math.round(Number(amount || 0) * 100);
};

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

const resolveId = async (model, mongoId) => {
  if (!mongoId) return null;
  const record = await model.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return record?.id || null;
};

const mapAttemptStatus = (value) =>
  [
    "initialized",
    "pending",
    "success",
    "failed",
    "amount_mismatch",
    "currency_mismatch",
    "provider_mismatch",
    "recovered",
    "review",
    "abandoned",
  ].includes(value)
    ? value
    : "review";

const mapRecoveryState = (value) => {
  if (["awaiting_verification", "recovered", "failed", "review"].includes(value)) return value;
  if (value === "fulfilled") return "recovered";
  return "review";
};

const mapRefundStatus = (value) => {
  if (["pending", "processing", "completed", "failed"].includes(value)) return value;
  if (value === "pending_wallet") return "pending";
  return "pending";
};

const importPaymentAttempts = async (dryRun, limit) => {
  const query = PaymentAttempt.find({}).sort({ createdAt: 1 });
  if (limit) query.limit(limit);
  const attempts = await query.lean();

  for (const attempt of attempts) {
    const orderId = await resolveId(prisma.order, attempt.orderId);
    const userId = await resolveId(prisma.user, attempt.userId);
    const providerPayload =
      attempt.providerPayload && typeof attempt.providerPayload === "object" ? attempt.providerPayload : {};

    const data = {
      legacyMongoId: toLegacyId(attempt._id),
      reference: attempt.reference,
      provider: attempt.provider || "paystack",
      orderId,
      orderCode: attempt.orderCode || "",
      userId,
      status: mapAttemptStatus(attempt.status),
      expectedAmount: toKobo(attempt.expectedAmount, attempt.expectedAmountKobo),
      expectedAmountKobo: Math.round(Number(attempt.expectedAmountKobo || 0)),
      paidAmount: toKobo(attempt.paidAmount, attempt.paidAmountKobo),
      paidAmountKobo: Math.round(Number(attempt.paidAmountKobo || 0)),
      currency: attempt.currency || "NGN",
      providerStatus: attempt.providerStatus || "",
      gatewayResponse: attempt.gatewayResponse || "",
      authorizationUrl: attempt.authorizationUrl || "",
      accessCode: attempt.accessCode || "",
      failureReason: attempt.failureReason || "",
      recoveryState: mapRecoveryState(attempt.recoveryState),
      orderSnapshot: attempt.orderSnapshot || {},
      cartSnapshot: attempt.cartSnapshot || {},
      providerPayload: {
        ...providerPayload,
        legacyRecoveryState: attempt.recoveryState || null,
        legacyOrderId: toLegacyId(attempt.orderId),
        legacyUserId: toLegacyId(attempt.userId),
      },
      events: attempt.events || [],
      createdAt: asDate(attempt.createdAt),
      updatedAt: asDate(attempt.updatedAt),
    };

    if (!data.reference) {
      stats.skipped.push(`paymentAttempt:${attempt._id}: missing reference`);
      continue;
    }

    await write(
      `paymentAttempt ${attempt._id}`,
      () =>
        prisma.paymentAttempt.upsert({
          where: { reference: data.reference },
          create: data,
          update: data,
        }),
      dryRun
    );
    stats.paymentAttempts += 1;
  }
};

const importPaymentLocks = async (dryRun, limit) => {
  const query = PaymentLock.find({}).sort({ createdAt: 1 });
  if (limit) query.limit(limit);
  const locks = await query.lean();

  for (const lock of locks) {
    const createdAt = asDate(lock.createdAt) || new Date();
    const data = {
      legacyMongoId: toLegacyId(lock._id),
      reference: lock.reference,
      lockedAt: createdAt,
      expiresAt: new Date(createdAt.getTime() + 300000),
      metadata: {},
      createdAt,
      updatedAt: asDate(lock.updatedAt) || createdAt,
    };

    if (!data.reference) {
      stats.skipped.push(`paymentLock:${lock._id}: missing reference`);
      continue;
    }

    await write(
      `paymentLock ${lock._id}`,
      () =>
        prisma.paymentLock.upsert({
          where: { reference: data.reference },
          create: data,
          update: data,
        }),
      dryRun
    );
    stats.paymentLocks += 1;
  }
};

const importRefunds = async (dryRun, limit) => {
  const query = Refund.find({}).sort({ createdAt: 1 });
  if (limit) query.limit(limit);
  const refunds = await query.lean();

  for (const refund of refunds) {
    const orderId = await resolveId(prisma.order, refund.orderId);
    const userId = await resolveId(prisma.user, refund.userId);
    const data = {
      legacyMongoId: toLegacyId(refund._id),
      orderId,
      userId,
      amount: toKobo(refund.amount),
      reason: refund.reason || null,
      status: mapRefundStatus(refund.status),
      metadata: {
        legacyOrderId: toLegacyId(refund.orderId),
        legacyUserId: toLegacyId(refund.userId),
        originalTotal: refund.originalTotal || 0,
        commissionRetained: refund.commissionRetained || 0,
        orderStatusAtCancellation: refund.orderStatusAtCancellation || "",
        notes: refund.notes || "",
        legacyStatus: refund.status || null,
      },
      createdAt: asDate(refund.createdAt),
      updatedAt: asDate(refund.updatedAt),
    };

    await write(
      `refund ${refund._id}`,
      () =>
        prisma.refund.upsert({
          where: { legacyMongoId: data.legacyMongoId },
          create: data,
          update: data,
        }),
      dryRun
    );
    stats.refunds += 1;
  }
};

const importTransactions = async (dryRun, limit) => {
  const query = Transaction.find({}).sort({ createdAt: 1 });
  if (limit) query.limit(limit);
  const transactions = await query.lean();

  for (const transaction of transactions) {
    const userId = await resolveId(prisma.user, transaction.user);
    const vendorId = await resolveId(prisma.vendor, transaction.vendor);
    const orderId = await resolveId(prisma.order, transaction.order);
    const data = {
      legacyMongoId: toLegacyId(transaction._id),
      userId,
      vendorId,
      orderId,
      reference: transaction.reference || null,
      amount: toKobo(transaction.amount),
      type: transaction.type || null,
      status: transaction.status || null,
      provider: transaction.method || null,
      metadata: {
        ...(transaction.metadata || {}),
        legacyUserId: toLegacyId(transaction.user),
        legacyVendorId: toLegacyId(transaction.vendor),
        legacyOrderId: toLegacyId(transaction.order),
        platformFee: transaction.platformFee || 0,
        deliveryFee: transaction.deliveryFee || 0,
        vendorShare: transaction.vendorShare || 0,
        method: transaction.method || null,
      },
      createdAt: asDate(transaction.createdAt),
      updatedAt: asDate(transaction.updatedAt),
    };

    await write(
      `transaction ${transaction._id}`,
      () =>
        prisma.transaction.upsert({
          where: { legacyMongoId: data.legacyMongoId },
          create: data,
          update: data,
        }),
      dryRun
    );
    stats.transactions += 1;
  }
};

const importInvoices = async (dryRun, limit) => {
  const query = Invoice.find({}).sort({ createdAt: 1 });
  if (limit) query.limit(limit);
  const invoices = await query.lean();

  for (const invoice of invoices) {
    const userId = await resolveId(prisma.user, invoice.userId);
    const orderId = await resolveId(prisma.order, invoice.orderId);
    const data = {
      legacyMongoId: toLegacyId(invoice._id),
      type: invoice.type,
      invoiceNumber: invoice.invoiceNumber,
      userId,
      orderId,
      paymentReference: invoice.paymentReference || null,
      amount: toKobo(invoice.total),
      lines: invoice.lines || [],
      metadata: {
        ...(invoice.metadata || {}),
        legacyUserId: toLegacyId(invoice.userId),
        legacyOrderId: toLegacyId(invoice.orderId),
        status: invoice.status || "paid",
        currency: invoice.currency || "NGN",
        subtotal: invoice.subtotal || 0,
        deliveryFee: invoice.deliveryFee || 0,
        serviceFee: invoice.serviceFee || 0,
        paidAt: invoice.paidAt || null,
        customer: invoice.customer || {},
      },
      createdAt: asDate(invoice.createdAt),
      updatedAt: asDate(invoice.updatedAt),
    };

    if (!data.invoiceNumber || !data.type) {
      stats.skipped.push(`invoice:${invoice._id}: missing invoiceNumber/type`);
      continue;
    }

    await write(
      `invoice ${invoice._id}`,
      () =>
        prisma.invoice.upsert({
          where: { invoiceNumber: data.invoiceNumber },
          create: data,
          update: data,
        }),
      dryRun
    );
    stats.invoices += 1;
  }
};

const importAll = async () => {
  const { dryRun, limit } = parseArgs();

  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  await mongoose.connect(process.env.MONGO_URI);

  try {
    await importPaymentAttempts(dryRun, limit);
    await importPaymentLocks(dryRun, limit);
    await importRefunds(dryRun, limit);
    await importTransactions(dryRun, limit);
    await importInvoices(dryRun, limit);
    console.log(JSON.stringify({ dryRun, stats }, null, 2));
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

importAll().catch(async (error) => {
  console.error("Mongo to Postgres finance payment import failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
