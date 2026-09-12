import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";
import { createMigrationControl } from "../services/postgres/migrationControl.js";

import VendorOrder from "../model/vendor/VendorOrder.js";

const stats = {
  vendorOrders: 0,
  skipped: [],
};

const toLegacyId = (value) => (value ? String(value) : null);
const asDate = (value) => (value ? new Date(value) : undefined);
const toKobo = (value) => value == null ? null : Math.round(Number(value || 0) * 100);
const cleanJson = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  return JSON.parse(JSON.stringify(value));
};

const parseArgs = () => {
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has("--dry-run"),
    limit: Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 0),
    batchSize: Math.max(1, Number(process.argv.find((arg) => arg.startsWith("--batch-size="))?.split("=")[1] || 100)),
    restart: args.has("--restart"),
    maxErrors: Math.max(1, Number(process.argv.find((arg) => arg.startsWith("--max-errors="))?.split("=")[1] || 25)),
    id: process.argv.find((arg) => arg.startsWith("--id="))?.split("=")[1] || null,
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

const importVendorOrder = async (vendorOrder, dryRun) => {
    const restaurantId = await resolveId(prisma.vendor, vendorOrder.restaurantId);
    const userOrderId = await resolveId(prisma.order, vendorOrder.userOrderId);

    if (!restaurantId || !userOrderId) {
      const error = new Error("missing restaurant/order dependency");
      error.code = "MISSING_DEPENDENCY";
      throw error;
    }

    const riderId = await resolveId(prisma.rider, vendorOrder.riderId);
    const data = {
      legacyMongoId: toLegacyId(vendorOrder._id),
      restaurantId,
      userOrderId,
      items: cleanJson(vendorOrder.items, []),
      commission: toKobo(vendorOrder.commission),
      vendorTotal: toKobo(vendorOrder.vendorTotal),
      customerNote: vendorOrder.customerNote || "",
      deliveryShare: toKobo(vendorOrder.deliveryShare),
      escrowAmount: toKobo(vendorOrder.escrowAmount) || 0,
      escrowReleased: vendorOrder.escrowReleased || false,
      orderStatus: mapOrderStatus(vendorOrder.orderStatus),
      riderId,
      cityId: toLegacyId(vendorOrder.cityId),
      stateId: toLegacyId(vendorOrder.stateId),
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
};

const importVendorOrders = async ({ dryRun, limit, batchSize, restart, maxErrors, id }, control) => {
  if (id) {
    const vendorOrder = await VendorOrder.findById(id).lean();
    if (!vendorOrder) throw new Error(`Vendor order ${id} not found`);
    await importVendorOrder(vendorOrder, dryRun);
    await control.advance(id, 1, { targeted: true });
    return;
  }
  const checkpoint = restart ? null : await control.checkpoint();
  let lastId = checkpoint?.lastSourceId || null;
  let remaining = limit || Number.POSITIVE_INFINITY;
  let errors = 0;

  while (remaining > 0) {
    const size = Math.min(batchSize, remaining);
    const filter = lastId ? { _id: { $gt: new mongoose.Types.ObjectId(lastId) } } : {};
    const vendorOrders = await VendorOrder.find(filter).sort({ _id: 1 }).limit(size).lean();
    if (!vendorOrders.length) break;

    for (const vendorOrder of vendorOrders) {
      const sourceId = toLegacyId(vendorOrder._id);
      try {
        await importVendorOrder(vendorOrder, dryRun);
      } catch (error) {
        errors += 1;
        stats.skipped.push(`vendorOrder:${sourceId}: ${error.message}`);
        await control.reject(sourceId, error, {
          _id: sourceId,
          restaurantId: toLegacyId(vendorOrder.restaurantId),
          userOrderId: toLegacyId(vendorOrder.userOrderId),
        });
        if (errors >= maxErrors) throw new Error(`Stopped after ${errors} rejected vendor orders`);
      }
      lastId = sourceId;
      remaining -= 1;
      await control.advance(lastId, 1, { errors });
      if (remaining <= 0) break;
    }
  }
};

const importAll = async () => {
  const options = parseArgs();
  const { dryRun } = options;

  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  await mongoose.connect(process.env.MONGO_URI);
  const control = createMigrationControl({ prisma, jobName: "vendor-orders-backfill-v2", sourceName: "vendor_orders", dryRun });

  try {
    await control.start({ batchSize: options.batchSize, limit: options.limit || null, restart: options.restart });
    await importVendorOrders(options, control);
    const run = await control.finish("completed", { stats });
    console.log(JSON.stringify({ dryRun, run, stats }, null, 2));
  } catch (error) {
    await control.finish("failed", { error: error.message, stats });
    throw error;
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
