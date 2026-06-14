import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import Order from "../model/order/Order.js";

const stats = {
  orders: 0,
  orderItems: 0,
  vendorDeliveryFees: 0,
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
  price: Number(item.price || 0),
  note: item.note || "",
  dietaryType: mapDietaryType(item.dietary_type),
  itemType: mapItemType(item.item_type),
  selectedOptions: cleanJson(item.selected_options, []),
  metadata: cleanJson(item.metadata, {}),
  createdAt: asDate(item.createdAt),
  updatedAt: asDate(item.updatedAt),
});

const importOrders = async (dryRun, limit) => {
  const query = Order.find({}).sort({ createdAt: 1 });
  if (limit) query.limit(limit);
  const orders = await query.lean();

  for (const order of orders) {
    const userId = await resolveId(prisma.user, order.userId);
    if (!userId) {
      stats.skipped.push(`order:${order._id}: missing user ${order.userId}`);
      continue;
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
      subtotal: Number(order.subtotal || 0),
      deliveryFee: Number(order.deliveryFee || 0),
      serviceFee: Number(order.serviceFee || 0),
      appliedDiscount: order.appliedDiscount ? cleanJson(order.appliedDiscount, null) : null,
      freeDeliveryPromo: cleanJson(order.freeDeliveryPromo, {}),
      vendorDeliveryPromo: cleanJson(order.vendorDeliveryPromo, {}),
      total: Number(order.total || 0),
      orderCode: order.orderId || orderLegacyId,
      paymentStatus: mapPaymentStatus(order.paymentStatus),
      paymentReference,
      idempotencyKey,
      orderStatus: mapOrderStatus(order.orderStatus),
      riderId,
      riderAssignment: cleanJson(order.riderAssignment, {}),
      riderEarnings: order.riderEarnings ?? null,
      statusLog: cleanJson(order.statusLog, []),
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

    if (dryRun || !savedOrder) continue;

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
              deliveryFee: Number(fee.deliveryFee || 0),
              createdAt: asDate(order.createdAt),
              updatedAt: asDate(order.updatedAt),
            },
            update: {
              deliveryFee: Number(fee.deliveryFee || 0),
              updatedAt: asDate(order.updatedAt),
            },
          }),
        dryRun
      );
      stats.vendorDeliveryFees += 1;
    }
  }
};

const importAll = async () => {
  const { dryRun, limit } = parseArgs();

  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  await mongoose.connect(process.env.MONGO_URI);

  try {
    await importOrders(dryRun, limit);
    console.log(JSON.stringify({ dryRun, stats }, null, 2));
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
