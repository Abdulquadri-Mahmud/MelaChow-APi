import "dotenv/config";
import prisma from "../config/prisma.js";

const JOB = "repair-legacy-naira-to-kobo-v1";
const dryRun = process.argv.includes("--dry-run");
const money = (value) => Math.round(Number(value || 0) * 100);
const nullableMoney = (value) => (value == null ? null : money(value));

const existing = await prisma.migrationRun.findFirst({ where: { jobName: JOB, status: "completed", dryRun: false } });
if (existing && !dryRun) {
  console.log(JSON.stringify({ skipped: true, reason: "repair already completed", runId: existing.id }, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

const counts = {
  orders: await prisma.order.count({ where: { legacyMongoId: { not: null } } }),
  orderItems: await prisma.orderItem.count({ where: { legacyMongoId: { not: null } } }),
  vendorOrders: await prisma.vendorOrder.count({ where: { legacyMongoId: { not: null } } }),
  walletTransactions: await prisma.walletTransaction.count({ where: { legacyMongoId: { not: null } } }),
  withdrawals: await prisma.withdrawal.count({ where: { legacyMongoId: { not: null } } }),
  riderWithdrawals: await prisma.riderWithdrawal.count({ where: { legacyMongoId: { not: null } } }),
};

if (dryRun) {
  console.log(JSON.stringify({ dryRun: true, job: JOB, counts }, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

const run = await prisma.migrationRun.create({ data: { jobName: JOB, status: "running", metadata: { counts } } });
try {
  await prisma.$transaction(async (tx) => {
    const orders = await tx.order.findMany({ where: { legacyMongoId: { not: null } }, select: { id: true, subtotal: true, deliveryFee: true, serviceFee: true, total: true, riderEarnings: true } });
    for (const row of orders) await tx.order.update({ where: { id: row.id }, data: { subtotal: money(row.subtotal), deliveryFee: money(row.deliveryFee), serviceFee: money(row.serviceFee), total: money(row.total), riderEarnings: nullableMoney(row.riderEarnings) } });

    const items = await tx.orderItem.findMany({ where: { legacyMongoId: { not: null } }, select: { id: true, price: true } });
    for (const row of items) await tx.orderItem.update({ where: { id: row.id }, data: { price: money(row.price) } });

    const fees = await tx.vendorDeliveryFee.findMany({ where: { order: { legacyMongoId: { not: null } } }, select: { id: true, deliveryFee: true } });
    for (const row of fees) await tx.vendorDeliveryFee.update({ where: { id: row.id }, data: { deliveryFee: money(row.deliveryFee) } });

    const vendorOrders = await tx.vendorOrder.findMany({ where: { legacyMongoId: { not: null } }, select: { id: true, commission: true, vendorTotal: true, deliveryShare: true, escrowAmount: true } });
    for (const row of vendorOrders) await tx.vendorOrder.update({ where: { id: row.id }, data: { commission: nullableMoney(row.commission), vendorTotal: nullableMoney(row.vendorTotal), deliveryShare: nullableMoney(row.deliveryShare), escrowAmount: money(row.escrowAmount) } });

    const walletTransactions = await tx.walletTransaction.findMany({ where: { legacyMongoId: { not: null } }, select: { id: true, amount: true, reportingAmount: true } });
    for (const row of walletTransactions) await tx.walletTransaction.update({ where: { id: row.id }, data: { amount: money(row.amount), reportingAmount: nullableMoney(row.reportingAmount) } });

    for (const model of [tx.withdrawal, tx.riderWithdrawal]) {
      const rows = await model.findMany({ where: { legacyMongoId: { not: null } }, select: { id: true, requestedAmount: true, transferFee: true, netAmount: true, appliedMarkup: true } });
      for (const row of rows) await model.update({ where: { id: row.id }, data: { requestedAmount: money(row.requestedAmount), transferFee: money(row.transferFee), netAmount: money(row.netAmount), appliedMarkup: money(row.appliedMarkup) } });
    }

    // Preserve native PostgreSQL activity: correct only the legacy opening
    // component of each balance, derived as current balance minus native tx net.
    const wallets = await tx.wallet.findMany({ where: { legacyMongoId: { not: null } }, include: { transactions: { where: { legacyMongoId: null }, select: { type: true, amount: true } } } });
    for (const wallet of wallets) {
      const nativeNet = wallet.transactions.reduce((sum, entry) => sum + (entry.type === "credit" ? entry.amount : -entry.amount), 0);
      const legacyOpeningBalance = wallet.balance - nativeNet;
      const hasNativeActivity = wallet.transactions.length > 0;
      await tx.wallet.update({ where: { id: wallet.id }, data: {
        balance: nativeNet + money(legacyOpeningBalance),
        ...(!hasNativeActivity ? { totalEarned: money(wallet.totalEarned), totalWithdrawn: money(wallet.totalWithdrawn) } : {}),
      } });
    }
  }, { timeout: 120000 });
  await prisma.migrationRun.update({ where: { id: run.id }, data: { status: "completed", processedCount: Object.values(counts).reduce((a, b) => a + b, 0), finishedAt: new Date(), metadata: { counts } } });
  console.log(JSON.stringify({ success: true, runId: run.id, counts }, null, 2));
} catch (error) {
  await prisma.migrationRun.update({ where: { id: run.id }, data: { status: "failed", finishedAt: new Date(), metadata: { counts, error: error.message } } });
  throw error;
} finally {
  await prisma.$disconnect();
}
