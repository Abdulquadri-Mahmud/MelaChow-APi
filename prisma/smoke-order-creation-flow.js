import "dotenv/config";
import prisma from "../config/prisma.js";
import { postgresOrderCreationRepository } from "../services/postgres/orderCreation.repository.js";
import { getVendorOpenStatus } from "../utils/vendorOpenStatus.js";

const liveWriteEnabled = process.env.PRISMA_SMOKE_WRITE === "1";
const legacyId = (row) => row?.legacyMongoId || row?.id || null;

const resolvedDeliveryFee = (vendor) => {
  if (vendor.platformDeliveryFeeOverride != null && vendor.platformDeliveryFeeOverride > 0) {
    return vendor.platformDeliveryFeeOverride;
  }
  return vendor.city?.platformDeliveryFee || 0;
};

const findCandidate = async () => {
  const user = await prisma.user.findFirst({
    where: { legacyMongoId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, legacyMongoId: true, email: true, phone: true },
  });
  if (!user) return null;

  const menuItems = await prisma.menuItem.findMany({
    where: {
      isAvailable: true,
      isInStock: true,
      isArchived: false,
      vendor: {
        active: true,
        suspended: false,
        deletedAt: null,
        OR: [
          { platformDeliveryFeeOverride: { gt: 0 } },
          { city: { platformDeliveryFee: { gte: 0 } } },
        ],
      },
      portions: { some: { isAvailable: true, isInStock: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 25,
    include: {
      vendor: {
        include: {
          city: { select: { platformDeliveryFee: true } },
        },
      },
      portions: {
        where: { isAvailable: true, isInStock: true },
        orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
        take: 1,
      },
    },
  });

  for (const item of menuItems) {
    const openStatus = getVendorOpenStatus(item.vendor.openingHours);
    if (openStatus.isOpen && item.portions.length) {
      return {
        user,
        vendor: item.vendor,
        item,
        portion: item.portions[0],
        deliveryFee: resolvedDeliveryFee(item.vendor),
      };
    }
  }

  const fallback = menuItems.find((item) => item.portions.length);
  if (!fallback) return null;

  return {
    user,
    vendor: fallback.vendor,
    item: fallback,
    portion: fallback.portions[0],
    deliveryFee: resolvedDeliveryFee(fallback.vendor),
    vendorClosed: true,
  };
};

const restoreVendorStats = async (vendorId, snapshot) => {
  await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      totalOrders: snapshot.totalOrders,
      totalSales: snapshot.totalSales,
    },
  });
};

const main = async () => {
  const candidate = await findCandidate();
  if (!candidate) {
    console.log(JSON.stringify({ ok: false, reason: "no_order_candidate" }, null, 2));
    return;
  }

  const payload = {
    userId: legacyId(candidate.user),
    items: [
      {
        type: "item",
        restaurantId: legacyId(candidate.vendor),
        foodId: legacyId(candidate.item),
        portionId: legacyId(candidate.portion),
        quantity: 1,
        storeName: candidate.vendor.storeName,
      },
    ],
    vendorDeliveryFees: [
      {
        restaurantId: legacyId(candidate.vendor),
        deliveryFee: candidate.deliveryFee,
      },
    ],
    deliveryAddress: {
      addressLine: "Postgres smoke test address",
      cityName: candidate.vendor.address?.city || "",
      stateName: candidate.vendor.address?.state || "",
      address: "Postgres smoke test address",
    },
    phone: candidate.user.phone || "08000000000",
    idempotencyKey: `pg-order-smoke-${Date.now()}`,
  };

  const summary = {
    user: legacyId(candidate.user),
    vendor: candidate.vendor.storeName,
    item: candidate.item.name,
    portion: candidate.portion.label,
    deliveryFee: candidate.deliveryFee,
    vendorClosed: Boolean(candidate.vendorClosed),
    liveWriteEnabled,
  };

  if (!liveWriteEnabled) {
    console.log(JSON.stringify({ ok: true, dryRun: true, candidate: summary, payload }, null, 2));
    return;
  }

  const vendorSnapshot = await prisma.vendor.findUnique({
    where: { id: candidate.vendor.id },
    select: { totalOrders: true, totalSales: true },
  });

  let createdOrderId = null;

  try {
    const result = await postgresOrderCreationRepository.createPendingOrder(payload);
    createdOrderId = result.order.id;

    const persisted = await prisma.order.findUnique({
      where: { id: createdOrderId },
      include: {
        items: true,
        vendorDeliveryFees: true,
        vendorOrders: true,
      },
    });

    console.log(JSON.stringify({
      ok: true,
      dryRun: false,
      candidate: summary,
      order: {
        id: result.order.id,
        orderId: result.order.orderId,
        paymentStatus: result.order.paymentStatus,
        orderStatus: result.order.orderStatus,
        subtotal: result.order.subtotal,
        deliveryFee: result.order.deliveryFee,
        serviceFee: result.order.serviceFee,
        total: result.order.total,
      },
      persisted: {
        itemCount: persisted?.items.length || 0,
        vendorDeliveryFeeCount: persisted?.vendorDeliveryFees.length || 0,
        vendorOrderCount: persisted?.vendorOrders.length || 0,
      },
    }, null, 2));
  } finally {
    if (createdOrderId) {
      await prisma.order.delete({ where: { id: createdOrderId } }).catch(() => null);
    }
    if (vendorSnapshot) {
      await restoreVendorStats(candidate.vendor.id, vendorSnapshot);
    }
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  await prisma.$disconnect();
  process.exit(1);
});
