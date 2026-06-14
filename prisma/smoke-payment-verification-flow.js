import "dotenv/config";
import prisma from "../config/prisma.js";
import { postgresOrderCreationRepository } from "../services/postgres/orderCreation.repository.js";
import { postgresPaymentRepository } from "../services/postgres/payment.repository.js";
import { getVendorOpenStatus } from "../utils/vendorOpenStatus.js";

const liveWriteEnabled = process.env.PRISMA_SMOKE_WRITE === "1";
const legacyId = (row) => row?.legacyMongoId || row?.id || null;

const alwaysOpenHours = {
  sunday: { open: "12:00 AM", close: "12:00 AM", closed: false },
  monday: { open: "12:00 AM", close: "12:00 AM", closed: false },
  tuesday: { open: "12:00 AM", close: "12:00 AM", closed: false },
  wednesday: { open: "12:00 AM", close: "12:00 AM", closed: false },
  thursday: { open: "12:00 AM", close: "12:00 AM", closed: false },
  friday: { open: "12:00 AM", close: "12:00 AM", closed: false },
  saturday: { open: "12:00 AM", close: "12:00 AM", closed: false },
};

const deliveryFee = (vendor) =>
  vendor.platformDeliveryFeeOverride != null && vendor.platformDeliveryFeeOverride > 0
    ? vendor.platformDeliveryFeeOverride
    : vendor.city?.platformDeliveryFee || 0;

const findCandidate = async () => {
  const user = await prisma.user.findFirst({
    where: { legacyMongoId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, legacyMongoId: true, email: true, phone: true },
  });
  if (!user) return null;

  const item = await prisma.menuItem.findFirst({
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
    include: {
      vendor: { include: { city: { select: { platformDeliveryFee: true } } } },
      portions: {
        where: { isAvailable: true, isInStock: true },
        orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
        take: 1,
      },
    },
  });
  if (!item || !item.portions.length) return null;

  return {
    user,
    vendor: item.vendor,
    item,
    portion: item.portions[0],
    deliveryFee: deliveryFee(item.vendor),
    vendorClosed: !getVendorOpenStatus(item.vendor.openingHours).isOpen,
  };
};

const main = async () => {
  const candidate = await findCandidate();
  if (!candidate) {
    console.log(JSON.stringify({ ok: false, reason: "no_payment_verification_candidate" }, null, 2));
    return;
  }

  const orderPayload = {
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
    vendorDeliveryFees: [{ restaurantId: legacyId(candidate.vendor), deliveryFee: candidate.deliveryFee }],
    deliveryAddress: {
      addressLine: "Postgres payment verification smoke address",
      cityName: candidate.vendor.address?.city || "",
      stateName: candidate.vendor.address?.state || "",
      address: "Postgres payment verification smoke address",
    },
    phone: candidate.user.phone || "08000000000",
    idempotencyKey: `pg-payment-verify-smoke-${Date.now()}`,
  };

  const summary = {
    user: legacyId(candidate.user),
    vendor: candidate.vendor.storeName,
    item: candidate.item.name,
    portion: candidate.portion.label,
    deliveryFee: candidate.deliveryFee,
    vendorClosed: candidate.vendorClosed,
    liveWriteEnabled,
  };

  if (!liveWriteEnabled) {
    console.log(JSON.stringify({ ok: true, dryRun: true, candidate: summary, orderPayload }, null, 2));
    return;
  }

  const vendorSnapshot = await prisma.vendor.findUnique({
    where: { id: candidate.vendor.id },
    select: { totalOrders: true, totalSales: true, openingHours: true },
  });
  let createdOrderId = null;
  let reference = null;

  try {
    if (candidate.vendorClosed) {
      await prisma.vendor.update({ where: { id: candidate.vendor.id }, data: { openingHours: alwaysOpenHours } });
    }

    const orderResult = await postgresOrderCreationRepository.createPendingOrder(orderPayload);
    createdOrderId = orderResult.order.id;
    reference = `PSK_${orderResult.order.orderId}_${Date.now()}`;
    await postgresPaymentRepository.initializeOrderPaymentReference({
      orderId: createdOrderId,
      reference,
      cartSnapshot: orderPayload,
    });

    const order = await postgresPaymentRepository.findOrderByPaymentReference(reference);
    await postgresPaymentRepository.validateSuccessfulPaymentForOrder(order, {
      reference,
      status: "success",
      amount: order.total,
      currency: "NGN",
      gateway_response: "Successful",
      paid_at: new Date().toISOString(),
    });

    const attempt = await prisma.paymentAttempt.findUnique({
      where: { reference },
      select: { status: true, recoveryState: true, providerStatus: true, paidAmount: true, events: true },
    });

    console.log(JSON.stringify({
      ok: true,
      dryRun: false,
      candidate: summary,
      paymentAttempt: {
        status: attempt?.status,
        recoveryState: attempt?.recoveryState,
        providerStatus: attempt?.providerStatus,
        paidAmount: Number(attempt?.paidAmount || 0),
        eventCount: Array.isArray(attempt?.events) ? attempt.events.length : 0,
      },
    }, null, 2));
  } finally {
    if (reference) await prisma.paymentAttempt.delete({ where: { reference } }).catch(() => null);
    if (createdOrderId) await prisma.order.delete({ where: { id: createdOrderId } }).catch(() => null);
    if (vendorSnapshot) {
      await prisma.vendor.update({
        where: { id: candidate.vendor.id },
        data: {
          totalOrders: vendorSnapshot.totalOrders,
          totalSales: vendorSnapshot.totalSales,
          openingHours: vendorSnapshot.openingHours,
        },
      });
    }
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  await prisma.$disconnect();
  process.exit(1);
});
