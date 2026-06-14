import "dotenv/config";
import prisma from "../config/prisma.js";

const legacyId = (row) => row?.legacyMongoId || row?.id || null;

const getPlatformConfigValue = async () => {
  const config = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  return config?.value && typeof config.value === "object" && !Array.isArray(config.value) ? config.value : {};
};

const findCandidate = async () => {
  const vendorOrder = await prisma.vendorOrder.findFirst({
    where: {
      riderId: { not: null },
      orderStatus: "out_for_delivery",
      userOrder: {
        orderStatus: "out_for_delivery",
      },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      rider: true,
      restaurant: true,
      userOrder: true,
    },
  });

  if (vendorOrder?.rider) {
    return {
      source: "vendorOrder",
      order: vendorOrder.userOrder,
      vendorOrder,
      rider: vendorOrder.rider,
    };
  }

  const order = await prisma.order.findFirst({
    where: {
      riderId: { not: null },
      orderStatus: "out_for_delivery",
    },
    orderBy: { updatedAt: "desc" },
    include: {
      rider: true,
    },
  });

  return order?.rider ? { source: "order", order, vendorOrder: null, rider: order.rider } : null;
};

const computeDeliveryFee = (order, rider, riderFixedPayout) => {
  if (rider.managedBy === "admin") return riderFixedPayout;

  const riderVendorId = rider.vendorId;
  const deliveryFeeEntry = (order.vendorDeliveryFees || []).find((fee) => fee.restaurantId === riderVendorId);
  let deliveryFee = Number(deliveryFeeEntry?.deliveryFee || 0);

  if (deliveryFee === 0) {
    const vendorPromo = order.vendorDeliveryPromo || {};
    const freeDeliveryPromo = order.freeDeliveryPromo || {};
    if (vendorPromo?.applied && vendorPromo.vendorId === riderVendorId) {
      deliveryFee = Number(vendorPromo.originalDeliveryFee || 0);
    } else if (freeDeliveryPromo?.eligible) {
      deliveryFee = Number(freeDeliveryPromo.originalDeliveryFee || 0);
    }
  }

  return deliveryFee;
};

const main = async () => {
  const candidate = await findCandidate();
  if (!candidate) {
    console.log(
      JSON.stringify(
        {
          foundCandidate: false,
          safeToRunLiveSmoke: false,
          reason: "No Postgres order/vendor order is currently out_for_delivery with an assigned rider.",
          nextStep: "Create or re-import a local test order, move it through ready_for_pickup and pickup, then rerun this preflight.",
        },
        null,
        2
      )
    );
    return;
  }

  const { order, vendorOrder, rider } = candidate;
  const platformConfig = await getPlatformConfigValue();
  const riderFixedPayout = Number(platformConfig.riderFixedPayout || 600);
  const deliveryFee = computeDeliveryFee(order, rider, riderFixedPayout);
  const riderPayout = deliveryFee > 0 ? Math.min(riderFixedPayout, deliveryFee) : 0;
  const platformSpread = deliveryFee > 0 ? Number((deliveryFee - riderPayout).toFixed(2)) : 0;

  const adminWallet = await prisma.wallet.findFirst({ where: { ownerModel: "Admin" }, orderBy: { createdAt: "asc" } });
  const riderWallet = await prisma.wallet.findUnique({
    where: { ownerId_ownerModel: { ownerId: rider.id, ownerModel: "Rider" } },
  });
  const vendorOrders = await prisma.vendorOrder.findMany({
    where: { userOrderId: order.id },
    include: { restaurant: { select: { id: true, legacyMongoId: true, storeName: true } } },
  });

  let remainingAdminBalance = Number(adminWallet?.balance || 0);
  const canCreditRiderPayout = Boolean(adminWallet && riderPayout > 0 && remainingAdminBalance >= riderPayout);
  if (canCreditRiderPayout) remainingAdminBalance -= riderPayout;

  const escrowChecks = vendorOrders.map((row) => {
    const amount = row.escrowReleased ? 0 : Number(row.escrowAmount || 0);
    const canRelease = amount <= 0 || Boolean(adminWallet && remainingAdminBalance >= amount);
    if (canRelease) remainingAdminBalance -= amount;
    return {
      vendorOrderId: legacyId(row),
      vendorId: legacyId(row.restaurant),
      vendorName: row.restaurant?.storeName || null,
      escrowAlreadyReleased: Boolean(row.escrowReleased),
      amount,
      canRelease,
    };
  });

  const blockingIssues = [
    !adminWallet ? "admin_wallet_missing" : null,
    riderPayout > 0 && !canCreditRiderPayout ? "admin_wallet_insufficient_for_rider_payout" : null,
    ...escrowChecks.filter((row) => !row.canRelease).map((row) => `admin_wallet_insufficient_for_escrow:${row.vendorOrderId}`),
  ].filter(Boolean);

  console.log(
    JSON.stringify(
      {
        foundCandidate: true,
        safeToRunLiveSmoke: blockingIssues.length === 0,
        blockingIssues,
        candidate: {
          source: candidate.source,
          orderId: legacyId(order),
          orderCode: order.orderCode,
          orderStatus: order.orderStatus,
          vendorOrderId: legacyId(vendorOrder),
          vendorOrderStatus: vendorOrder?.orderStatus || null,
          riderId: legacyId(rider),
          riderStatus: rider.status,
          riderManagedBy: rider.managedBy,
        },
        expectedEffects: {
          deliveryFee,
          riderFixedPayout,
          riderPayout,
          platformSpread,
          adminWalletBalance: adminWallet?.balance ?? null,
          riderWalletExists: Boolean(riderWallet),
          vendorEscrow: escrowChecks,
          remainingAdminBalanceAfterAllCredits: adminWallet ? remainingAdminBalance : null,
        },
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error("Rider delivery write preflight failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
