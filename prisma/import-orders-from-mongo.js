import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";
import { createMigrationControl } from "../services/postgres/migrationControl.js";

import Order from "../model/order/Order.js";

const stats = {
  orders: 0,
  orderItems: 0,
  vendorDeliveryFees: 0,
  skipped: [],
};

const toLegacyId = (value) => (value ? String(value) : null);
const asDate = (value) => (value ? new Date(value) : undefined);
const toKobo = (value) => Math.round(Number(value || 0) * 100);
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

const mapPaymentStatus = (value) => (["pending", "paid", "failed", "refunded"].includes(value) ? value : "pending");
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

const mapDietaryType = (value) => {
  if (value === "non-veg") return "non_veg";
  if (["veg", "non_veg", "vegan", "halal", "kosher", "mixed"].includes(value)) return value;
  return null;
};

const mapItemType = (value) =>
  ["FOOD", "DRINK", "SIDE", "PROTEIN", "SWALLOW", "SOUP", "DESSERT", "OTHER", "combo"].includes(value) ? value : null;

const resolveId = async (model, mongoId) => {
  if (!mongoId) return null;
  const record = await model.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return record?.id || null;
};

const orderItemData = async (orderId, orderLegacyId, item, index) => ({
  legacyMongoId: toLegacyId(item._id) || `${orderLegacyId}:item:${index}`,
  orderId,
  type: item.type === "combo" ? "combo" : "item",
  foodId: await resolveId(prisma.menuItem, item.foodId),
  portionId: await resolveId(prisma.menuItemPortion, item.portionId),
  variantId: await resolveId(prisma.comboItem, item.variantId),
  restaurantId: await resolveId(prisma.vendor, item.restaurantId),
  storeName: item.storeName || "",
  variant: cleanJson(item.variant, {}),
  name: item.name || "",
  imageUrl: item.image_url || "",
  portionLabel: item.portion_label || "",
  quantity: Number(item.quantity || 1),
  portionQuantity: Number(item.portion_quantity || 1),
  price: toKobo(item.price),
  note: item.note || "",
  mealGroupLabel: item.meal_group_label || "",
  dietaryType: mapDietaryType(item.dietary_type),
  itemType: mapItemType(item.item_type),
  selectedOptions: cleanJson(item.selected_options, []),
  metadata: cleanJson(item.metadata, {}),
  createdAt: asDate(item.createdAt),
  updatedAt: asDate(item.updatedAt),
});

const importOrder = async (order, dryRun) => {
    const userId = await resolveId(prisma.user, order.userId);
    if (!userId) {
      const error = new Error(`missing user ${order.userId}`);
      error.code = "MISSING_USER";
      throw error;
    }

    const riderId = await resolveId(prisma.rider, order.riderId);
    const orderLegacyId = toLegacyId(order._id);
    const paymentReference = order.paymentReference || undefined;
    const idempotencyKey = order.idempotencyKey || undefined;
    const data = {
      legacyMongoId: orderLegacyId,
      userId,
      deliveryAddress: cleanJson(order.deliveryAddress, {}),
      phone: order.phone || "",
      restaurantNotes: cleanJson(order.restaurantNotes, {}),
      subtotal: toKobo(order.subtotal),
      deliveryFee: toKobo(order.deliveryFee),
      serviceFee: toKobo(order.serviceFee),
      appliedDiscount: order.appliedDiscount ? cleanJson(order.appliedDiscount, null) : null,
      freeDeliveryPromo: cleanJson(order.freeDeliveryPromo, {}),
      vendorDeliveryPromo: cleanJson(order.vendorDeliveryPromo, {}),
      total: toKobo(order.total),
      orderCode: order.orderId || orderLegacyId,
      paymentStatus: mapPaymentStatus(order.paymentStatus),
      paymentReference,
      idempotencyKey,
      orderStatus: mapOrderStatus(order.orderStatus),
      riderId,
      riderAssignment: cleanJson(order.riderAssignment, {}),
      riderEarnings: order.riderEarnings == null ? null : toKobo(order.riderEarnings),
      statusLog: cleanJson(order.statusLog, []),
      optionStockReservedAt: asDate(order.optionStockReservedAt),
      optionStockRestoredAt: asDate(order.optionStockRestoredAt),
      portionStockReservedAt: asDate(order.portionStockReservedAt),
      portionStockRestoredAt: asDate(order.portionStockRestoredAt),
      createdAt: asDate(order.createdAt),
      updatedAt: asDate(order.updatedAt),
    };

    const savedOrder = await write(
      `order ${order._id}`,
      () =>
        prisma.order.upsert({
          where: { legacyMongoId: data.legacyMongoId },
          create: data,
          update: data,
        }),
      dryRun
    );
    stats.orders += 1;

    if (dryRun || !savedOrder) return;

    for (const [index, item] of (order.items || []).entries()) {
      const itemData = await orderItemData(savedOrder.id, orderLegacyId, item, index);
      await write(
        `order item ${itemData.legacyMongoId}`,
        () =>
          prisma.orderItem.upsert({
            where: { legacyMongoId: itemData.legacyMongoId },
            create: itemData,
            update: itemData,
          }),
        dryRun
      );
      stats.orderItems += 1;
    }

    for (const fee of order.vendorDeliveryFees || []) {
      const restaurantId = await resolveId(prisma.vendor, fee.restaurantId);
      if (!restaurantId) {
        stats.skipped.push(`vendorDeliveryFee:${order._id}:${fee.restaurantId}: missing vendor`);
        continue;
      }

      await write(
        `vendor delivery fee ${order._id}:${fee.restaurantId}`,
        () =>
          prisma.vendorDeliveryFee.upsert({
            where: {
              orderId_restaurantId: {
                orderId: savedOrder.id,
                restaurantId,
              },
            },
            create: {
              orderId: savedOrder.id,
              restaurantId,
              deliveryFee: toKobo(fee.deliveryFee),
              createdAt: asDate(order.createdAt),
              updatedAt: asDate(order.updatedAt),
            },
            update: {
              deliveryFee: toKobo(fee.deliveryFee),
              updatedAt: asDate(order.updatedAt),
            },
          }),
        dryRun
      );
      stats.vendorDeliveryFees += 1;
    }
};

const importOrders = async ({ dryRun, limit, batchSize, restart, maxErrors, id }, control) => {
  if (id) {
    const order = await Order.findById(id).lean();
    if (!order) throw new Error(`Order ${id} not found`);
    await importOrder(order, dryRun);
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
    const orders = await Order.find(filter).sort({ _id: 1 }).limit(size).lean();
    if (!orders.length) break;

    for (const order of orders) {
      const sourceId = toLegacyId(order._id);
      try {
        await importOrder(order, dryRun);
      } catch (error) {
        errors += 1;
        stats.skipped.push(`order:${sourceId}: ${error.message}`);
        await control.reject(sourceId, error, {
          _id: sourceId,
          orderId: order.orderId || null,
          userId: toLegacyId(order.userId),
        });
        if (errors >= maxErrors) throw new Error(`Stopped after ${errors} rejected orders`);
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
  const control = createMigrationControl({ prisma, jobName: "orders-backfill-v2", sourceName: "orders", dryRun });

  try {
    await control.start({ batchSize: options.batchSize, limit: options.limit || null, restart: options.restart });
    await importOrders(options, control);
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
  console.error("Mongo to Postgres order import failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
