import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import PaymentAttempt from "../model/order/PaymentAttempt.js";
import PaymentLock from "../model/order/PaymentLock.js";
import Refund from "../model/refund.model.js";
import Transaction from "../model/transacrion/transaction.models.js";
import Invoice from "../model/invoice.model.js";

const toKobo = (amount, koboAmount) => {
  if (Number.isFinite(Number(koboAmount)) && Number(koboAmount) > 0) return Math.round(Number(koboAmount));
  return Math.round(Number(amount || 0) * 100);
};

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

const sortObject = (value) =>
  Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));

const diffObjects = (left, right, path = "$", diffs = []) => {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();

  for (const key of leftKeys.filter((key) => !rightKeys.includes(key))) {
    diffs.push(`${path}.${key}: missing in postgres`);
  }
  for (const key of rightKeys.filter((key) => !leftKeys.includes(key))) {
    diffs.push(`${path}.${key}: extra in postgres`);
  }
  for (const key of leftKeys.filter((key) => rightKeys.includes(key))) {
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue && rightValue && typeof leftValue === "object" && typeof rightValue === "object") {
      diffObjects(leftValue, rightValue, `${path}.${key}`, diffs);
    } else if (leftValue !== rightValue) {
      diffs.push(`${path}.${key}: ${leftValue} !== ${rightValue}`);
    }
  }

  return diffs;
};

const mongoGroup = async (model, field, mapper = (value) => value || "unknown") => {
  const rows = await model.aggregate([{ $group: { _id: `$${field}`, count: { $sum: 1 } } }]);
  return sortObject(
    rows.reduce((acc, row) => {
      const key = mapper(row._id);
      acc[key] = (acc[key] || 0) + row.count;
      return acc;
    }, {})
  );
};

const prismaGroup = async (model, field) => {
  const rows = await model.groupBy({ by: [field], _count: { _all: true } });
  return sortObject(
    rows.reduce((acc, row) => {
      acc[row[field] || "unknown"] = row._count._all;
      return acc;
    }, {})
  );
};

const mongoSums = async () => {
  const [attempts, refunds, transactions, invoices] = await Promise.all([
    PaymentAttempt.find({}).select("expectedAmount expectedAmountKobo paidAmount paidAmountKobo").lean(),
    Refund.find({}).select("amount").lean(),
    Transaction.find({}).select("amount").lean(),
    Invoice.find({}).select("total").lean(),
  ]);

  return {
    paymentAttemptExpectedKobo: attempts.reduce((sum, attempt) => sum + toKobo(attempt.expectedAmount, attempt.expectedAmountKobo), 0),
    paymentAttemptPaidKobo: attempts.reduce((sum, attempt) => sum + toKobo(attempt.paidAmount, attempt.paidAmountKobo), 0),
    refundKobo: refunds.reduce((sum, refund) => sum + toKobo(refund.amount), 0),
    transactionKobo: transactions.reduce((sum, transaction) => sum + toKobo(transaction.amount), 0),
    invoiceKobo: invoices.reduce((sum, invoice) => sum + toKobo(invoice.total), 0),
  };
};

const prismaSums = async () => {
  const [attempts, refunds, transactions, invoices] = await Promise.all([
    prisma.paymentAttempt.aggregate({ _sum: { expectedAmount: true, paidAmount: true } }),
    prisma.refund.aggregate({ _sum: { amount: true } }),
    prisma.transaction.aggregate({ _sum: { amount: true } }),
    prisma.invoice.aggregate({ _sum: { amount: true } }),
  ]);

  return {
    paymentAttemptExpectedKobo: Number(attempts._sum.expectedAmount || 0),
    paymentAttemptPaidKobo: Number(attempts._sum.paidAmount || 0),
    refundKobo: Number(refunds._sum.amount || 0),
    transactionKobo: Number(transactions._sum.amount || 0),
    invoiceKobo: Number(invoices._sum.amount || 0),
  };
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const mongo = {
      counts: {
        paymentAttempts: await PaymentAttempt.countDocuments(),
        paymentLocks: await PaymentLock.countDocuments(),
        refunds: await Refund.countDocuments(),
        transactions: await Transaction.countDocuments(),
        invoices: await Invoice.countDocuments(),
      },
      paymentAttemptStatuses: await mongoGroup(PaymentAttempt, "status"),
      paymentRecoveryStates: await mongoGroup(PaymentAttempt, "recoveryState", mapRecoveryState),
      refundStatuses: await mongoGroup(Refund, "status", mapRefundStatus),
      invoiceTypes: await mongoGroup(Invoice, "type"),
      sums: await mongoSums(),
    };

    const postgres = {
      counts: {
        paymentAttempts: await prisma.paymentAttempt.count(),
        paymentLocks: await prisma.paymentLock.count(),
        refunds: await prisma.refund.count(),
        transactions: await prisma.transaction.count(),
        invoices: await prisma.invoice.count(),
      },
      paymentAttemptStatuses: await prismaGroup(prisma.paymentAttempt, "status"),
      paymentRecoveryStates: await prismaGroup(prisma.paymentAttempt, "recoveryState"),
      refundStatuses: await prismaGroup(prisma.refund, "status"),
      invoiceTypes: await prismaGroup(prisma.invoice, "type"),
      sums: await prismaSums(),
    };

    const diffs = diffObjects(mongo, postgres);
    console.log(JSON.stringify({ diffCount: diffs.length, diffs, mongo, postgres }, null, 2));
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error("Finance payment parity check failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
