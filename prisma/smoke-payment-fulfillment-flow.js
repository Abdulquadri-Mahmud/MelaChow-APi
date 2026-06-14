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
    console.log(JSON.stringify({ ok: false, reason: "no_payment_fulfillment_candidate" }, null, 2));
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
      addressLine: "Postgres payment fulfillment smoke address",
      cityName: candidate.vendor.address?.city || "",
      stateName: candidate.vendor.address?.state || "",
      address: "Postgres payment fulfillment smoke address",
    },
    phone: candidate.user.phone || "08000000000",
    idempotencyKey: `pg-payment-fulfillment-smoke-${Date.now()}`,
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
  const adminWalletSnapshot = await prisma.wallet.findFirst({
    where: { ownerModel: "Admin" },
    orderBy: { createdAt: "asc" },
    select: { id: true, balance: true, totalEarned: true, totalWithdrawn: true },
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
    const fulfillment = await postgresPaymentRepository.fulfillPaidOrder(reference);
    const idempotentFulfillment = await postgresPaymentRepository.fulfillPaidOrder(reference);

    const fulfilledOrder = await prisma.order.findUnique({
      where: { id: createdOrderId },
      select: { paymentStatus: true, orderStatus: true, total: true, subtotal: true, deliveryFee: true, serviceFee: true },
    });
    const txRows = await prisma.walletTransaction.findMany({
      where: { orderId: createdOrderId, metadata: { path: ["source"], equals: "postgres_payment_fulfillment" } },
      orderBy: { createdAt: "asc" },
      select: { type: true, amount: true, transactionType: true },
    });
    const invoice = await prisma.invoice.findFirst({
      where: { type: "order", orderId: createdOrderId },
      select: { invoiceNumber: true, amount: true, lines: true, metadata: true },
    });
    const adminWallet = await prisma.wallet.findFirst({
      where: { ownerModel: "Admin" },
      orderBy: { createdAt: "asc" },
      select: { id: true, balance: true },
    });

    console.log(JSON.stringify({
      ok: true,
      dryRun: false,
      candidate: summary,
      order: fulfilledOrder,
      fulfillment: {
        idempotent: fulfillment.idempotent,
        secondRunIdempotent: idempotentFulfillment.idempotent,
        secondRunCreditedKobo: idempotentFulfillment.creditedKobo,
        creditedKobo: fulfillment.creditedKobo,
        invoice: invoice ? {
          invoiceNumber: invoice.invoiceNumber,
          amount: Number(invoice.amount || 0),
          lineCount: Array.isArray(invoice.lines) ? invoice.lines.length : 0,
          source: invoice.metadata?.source,
        } : null,
        walletTransactionCount: txRows.length,
        walletTransactions: txRows,
        adminWalletBalanceDelta: adminWalletSnapshot && adminWallet?.id === adminWalletSnapshot.id
          ? adminWallet.balance - adminWalletSnapshot.balance
          : null,
      },
    }, null, 2));
  } finally {
    if (createdOrderId) {
      await prisma.walletTransaction.deleteMany({ where: { orderId: createdOrderId } }).catch(() => null);
      await prisma.invoice.deleteMany({ where: { orderId: createdOrderId } }).catch(() => null);
    }
    if (adminWalletSnapshot) {
      await prisma.wallet.update({
        where: { id: adminWalletSnapshot.id },
        data: {
          balance: adminWalletSnapshot.balance,
          totalEarned: adminWalletSnapshot.totalEarned,
          totalWithdrawn: adminWalletSnapshot.totalWithdrawn,
        },
      }).catch(() => null);
    }
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
