import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

const sumMongo = async (collection, field) => {
  const [row] = await collection.aggregate([{ $group: { _id: null, value: { $sum: `$${field}` } } }]).toArray();
  return Number(row?.value || 0);
};

const sumPostgres = async (model, field) => {
  const result = await model.aggregate({ _sum: { [field]: true } });
  return Number(result._sum[field] || 0);
};

const compare = (label, mongo, postgres) => ({ label, mongo, postgres, matches: mongo === postgres });

const main = async () => {
  if (!process.env.MONGO_URI || !process.env.DATABASE_URL) throw new Error("MONGO_URI and DATABASE_URL are required");
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  try {
    const checks = [];
    const countChecks = [
      ["users", "users", prisma.user], ["admins", "admins", prisma.admin], ["vendors", "vendors", prisma.vendor],
      ["riders", "riders", prisma.rider], ["orders", "orders", prisma.order], ["vendor orders", "vendororders", prisma.vendorOrder],
      ["rider assignments", "riderassignments", prisma.riderAssignment], ["wallets", "wallets", prisma.wallet],
      ["payment attempts", "paymentattempts", prisma.paymentAttempt], ["refunds", "refunds", prisma.refund], ["invoices", "invoices", prisma.invoice],
    ];
    for (const [label, collection, model] of countChecks) {
      checks.push(compare(`${label} count`, await db.collection(collection).countDocuments(), await model.count()));
    }

    checks.push(compare("order total", await sumMongo(db.collection("orders"), "total"), await sumPostgres(prisma.order, "total")));
    checks.push(compare("wallet balance", await sumMongo(db.collection("wallets"), "balance"), await sumPostgres(prisma.wallet, "balance")));
    checks.push(compare("refund amount (kobo)", (await sumMongo(db.collection("refunds"), "amount")) * 100, await sumPostgres(prisma.refund, "amount")));
    checks.push(compare("invoice total (kobo)", (await sumMongo(db.collection("invoices"), "total")) * 100, await sumPostgres(prisma.invoice, "amount")));

    const [{ count: orphanedVendorOrders }] = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS count
      FROM vendor_orders vo
      LEFT JOIN vendors v ON v.id = vo.restaurant_id
      LEFT JOIN orders o ON o.id = vo.user_order_id
      WHERE v.id IS NULL OR o.id IS NULL
    `;
    const rejected = await prisma.migrationReject.count();
    const failures = checks.filter((check) => !check.matches);
    const report = { generatedAt: new Date().toISOString(), database: db.databaseName, checks, orphanedVendorOrders, migrationRejects: rejected, passed: failures.length === 0 && orphanedVendorOrders === 0 };
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error("Core reconciliation failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
