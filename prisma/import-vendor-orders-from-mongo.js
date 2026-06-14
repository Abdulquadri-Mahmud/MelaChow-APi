import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import VendorOrder from "../model/vendor/VendorOrder.js";

const stats = {
  vendorOrders: 0,
  skipped: [],
};

const toLegacyId = (value) => (value ? String(value) : null);
const asDate = (value) => (value ? new Date(value) : undefined);
const cleanJson = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  return JSON.parse(JSON.stringify(value));
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

const mapOrderStatus = (value) =>
  [
    "pending",
    "accepted",
    "preparing",
    "ready_for_pickup",
    "rider_assigned",
    "out_for_delivery",
    "delivered",
    "completed",
    "cancelled",
    "failed",
    "refunded",
  ].includes(value)
    ? value
    : "pending";

const resolveId = async (model, mongoId) => {
  if (!mongoId) return null;
  const record = await model.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return record?.id || null;
};

const importVendorOrders = async (dryRun, limit) => {
  const query = VendorOrder.find({}).sort({ createdAt: 1 });
  if (limit) query.limit(limit);
  const vendorOrders = await query.lean();

  for (const vendorOrder of vendorOrders) {
    const restaurantId = await resolveId(prisma.vendor, vendorOrder.restaurantId);
    const userOrderId = await resolveId(prisma.order, vendorOrder.userOrderId);

    if (!restaurantId || !userOrderId) {
      stats.skipped.push(`vendorOrder:${vendorOrder._id}: missing restaurant/order`);
      continue;
    }

    const riderId = await resolveId(prisma.rider, vendorOrder.riderId);
    const data = {
      legacyMongoId: toLegacyId(vendorOrder._id),
      restaurantId,
      userOrderId,
      items: cleanJson(vendorOrder.items, []),
      commission: vendorOrder.commission ?? null,
      vendorTotal: vendorOrder.vendorTotal ?? null,
      deliveryShare: vendorOrder.deliveryShare ?? null,
      escrowAmount: vendorOrder.escrowAmount || 0,
      escrowReleased: vendorOrder.escrowReleased || false,
      orderStatus: mapOrderStatus(vendorOrder.orderStatus),
      riderId,
      createdAt: asDate(vendorOrder.createdAt),
      updatedAt: asDate(vendorOrder.updatedAt),
    };

    await write(
      `vendorOrder ${vendorOrder._id}`,
      () =>
        prisma.vendorOrder.upsert({
          where: { legacyMongoId: data.legacyMongoId },
          create: data,
          update: data,
        }),
      dryRun
    );
    stats.vendorOrders += 1;
  }
};

const importAll = async () => {
  const { dryRun, limit } = parseArgs();

  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  await mongoose.connect(process.env.MONGO_URI);

  try {
    await importVendorOrders(dryRun, limit);
    console.log(JSON.stringify({ dryRun, stats }, null, 2));
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

importAll().catch(async (error) => {
  console.error("Mongo to Postgres vendor order import failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
