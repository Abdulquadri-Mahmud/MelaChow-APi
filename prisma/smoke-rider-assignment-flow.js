import "dotenv/config";
import prisma from "../config/prisma.js";
import { adminOrdersRepository } from "../services/postgres/adminOrders.repository.js";
import { riderSelfRepository } from "../services/postgres/riderSelf.repository.js";

const liveWriteEnabled = process.env.PRISMA_SMOKE_WRITE === "1";
const allowedStartStatuses = ["accepted", "preparing", "ready_for_pickup"];
const legacyId = (row) => row?.legacyMongoId || row?.id || null;
const mongoIdPattern = /^[a-f\d]{24}$/i;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const stripId = (row) => {
  const { id, ...data } = row;
  return data;
};

const resolveId = async (model, value) => {
  if (!value) return null;
  const stringValue = String(value);
  if (uuidPattern.test(stringValue)) return stringValue;
  if (!mongoIdPattern.test(stringValue)) return null;
  const record = await model.findUnique({ where: { legacyMongoId: stringValue }, select: { id: true } });
  return record?.id || null;
};

const findCandidate = async () => {
  const vendorOrders = await prisma.vendorOrder.findMany({
    where: {
      riderId: null,
      orderStatus: { in: allowedStartStatuses },
      restaurant: {
        deliveryManagedBy: "admin",
      },
      userOrder: {
        paymentStatus: "paid",
        orderStatus: { in: allowedStartStatuses },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: {
      restaurant: {
        select: {
          id: true,
          legacyMongoId: true,
          storeName: true,
          cityId: true,
          stateId: true,
        },
      },
      userOrder: true,
    },
  });

  for (const vendorOrder of vendorOrders) {
    const deliveryAddress = vendorOrder.userOrder.deliveryAddress || {};
    const cityId = (await resolveId(prisma.city, deliveryAddress.cityId)) || vendorOrder.restaurant.cityId;
    const stateId = (await resolveId(prisma.state, deliveryAddress.stateId)) || vendorOrder.restaurant.stateId;
    if (!cityId || !stateId) continue;

    const pastAssignments = await prisma.riderAssignment.findMany({
      where: { vendorOrderId: vendorOrder.id },
      select: { riderId: true },
    });
    const handledRiderIds = pastAssignments.map((assignment) => assignment.riderId).filter(Boolean);
    const eligibleRiders = await prisma.rider.findMany({
      where: {
        cityId,
        stateId,
        status: "available",
        currentOrderId: null,
        isActive: true,
        isVerified: true,
        deletedAt: null,
        ...(handledRiderIds.length ? { id: { notIn: handledRiderIds } } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        legacyMongoId: true,
        name: true,
        status: true,
        currentOrderId: true,
      },
    });

    if (eligibleRiders.length) {
      return {
        fixtureMode: "natural",
        vendorOrder,
        order: vendorOrder.userOrder,
        cityId,
        stateId,
        eligibleRiders,
      };
    }
  }

  const fallbackVendorOrder = await prisma.vendorOrder.findFirst({
    where: {
      riderId: null,
      orderStatus: { notIn: ["out_for_delivery", "delivered", "completed", "cancelled", "failed"] },
      restaurant: {
        deliveryManagedBy: "admin",
      },
      userOrder: {
        paymentStatus: "paid",
        orderStatus: { notIn: ["out_for_delivery", "delivered", "completed", "cancelled", "failed"] },
      },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      restaurant: {
        select: {
          id: true,
          legacyMongoId: true,
          storeName: true,
          cityId: true,
          stateId: true,
        },
      },
      userOrder: true,
    },
  });
  if (!fallbackVendorOrder) return null;

  const deliveryAddress = fallbackVendorOrder.userOrder.deliveryAddress || {};
  const cityId = (await resolveId(prisma.city, deliveryAddress.cityId)) || fallbackVendorOrder.restaurant.cityId;
  const stateId = (await resolveId(prisma.state, deliveryAddress.stateId)) || fallbackVendorOrder.restaurant.stateId;
  if (!cityId || !stateId) return null;

  const rider = await prisma.rider.findFirst({
    where: {
      isActive: true,
      isVerified: true,
      deletedAt: null,
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      legacyMongoId: true,
      name: true,
      status: true,
      currentOrderId: true,
    },
  });
  if (!rider) return null;

  return {
    fixtureMode: "prepared",
    vendorOrder: fallbackVendorOrder,
    order: fallbackVendorOrder.userOrder,
    cityId,
    stateId,
    eligibleRiders: [rider],
    clearPastAssignmentForRider: true,
  };
};

const captureSnapshot = async ({ vendorOrder, order, cityId, stateId, eligibleRiders }) => {
  const siblingVendorOrders = await prisma.vendorOrder.findMany({ where: { userOrderId: order.id } });
  const vendorOwnerIds = siblingVendorOrders.map((row) => row.restaurantId).filter(Boolean);
  const candidateRiders = await prisma.rider.findMany({
    where: {
      cityId,
      stateId,
      status: { in: ["available", "pending_assignment", "on_delivery"] },
      isActive: true,
      isVerified: true,
      deletedAt: null,
    },
  });
  const riderIds = [...new Set([...candidateRiders.map((row) => row.id), ...eligibleRiders.map((row) => row.id)])];
  const ownerPairs = [
    ...riderIds.map((ownerId) => ({ ownerId, ownerModel: "Rider" })),
    ...vendorOwnerIds.map((ownerId) => ({ ownerId, ownerModel: "Vendor" })),
  ];

  const wallets = await prisma.wallet.findMany({
    where: {
      OR: [{ ownerModel: "Admin" }, ...ownerPairs],
    },
  });
  const walletIds = wallets.map((wallet) => wallet.id);
  const walletTransactions = walletIds.length
    ? await prisma.walletTransaction.findMany({
        where: {
          OR: [{ walletId: { in: walletIds } }, { orderId: order.id }],
        },
        select: { id: true },
      })
    : [];
  const assignments = await prisma.riderAssignment.findMany({
    where: {
      OR: [
        { orderId: order.id },
        { vendorOrderId: vendorOrder.id },
        ...(riderIds.length ? [{ riderId: { in: riderIds } }] : []),
      ],
    },
  });

  return {
    order: await prisma.order.findUnique({ where: { id: order.id } }),
    vendorOrders: siblingVendorOrders,
    riders: await prisma.rider.findMany({ where: { id: { in: riderIds } } }),
    assignments,
    wallets,
    walletTransactionIds: walletTransactions.map((row) => row.id),
    ownerPairs,
  };
};

const restoreSnapshot = async (snapshot) => {
  const currentWallets = await prisma.wallet.findMany({
    where: {
      OR: [{ ownerModel: "Admin" }, ...snapshot.ownerPairs],
    },
    select: { id: true },
  });
  const currentWalletIds = currentWallets.map((wallet) => wallet.id);

  if (currentWalletIds.length) {
    await prisma.walletTransaction.deleteMany({
      where: {
        OR: [
          { orderId: snapshot.order.id },
          {
            walletId: { in: currentWalletIds },
            id: { notIn: snapshot.walletTransactionIds },
          },
        ],
      },
    });
  }

  const snapshotAssignmentIds = snapshot.assignments.map((assignment) => assignment.id);
  await prisma.riderAssignment.deleteMany({
    where: {
      OR: [
        { orderId: snapshot.order.id },
        { vendorOrderId: { in: snapshot.vendorOrders.map((row) => row.id) } },
        ...(snapshot.riders.length ? [{ riderId: { in: snapshot.riders.map((row) => row.id) } }] : []),
      ],
      ...(snapshotAssignmentIds.length ? { id: { notIn: snapshotAssignmentIds } } : {}),
    },
  });

  for (const assignment of snapshot.assignments) {
    await prisma.riderAssignment.upsert({
      where: { id: assignment.id },
      update: stripId(assignment),
      create: assignment,
    });
  }
  for (const vendorOrder of snapshot.vendorOrders) {
    await prisma.vendorOrder.update({ where: { id: vendorOrder.id }, data: stripId(vendorOrder) });
  }
  for (const rider of snapshot.riders) {
    await prisma.rider.update({ where: { id: rider.id }, data: stripId(rider) });
  }
  await prisma.order.update({ where: { id: snapshot.order.id }, data: stripId(snapshot.order) });

  const snapshotWalletIds = snapshot.wallets.map((wallet) => wallet.id);
  for (const wallet of snapshot.wallets) {
    await prisma.wallet.update({ where: { id: wallet.id }, data: stripId(wallet) });
  }
  if (currentWalletIds.length) {
    await prisma.wallet.deleteMany({
      where: {
        id: { in: currentWalletIds, notIn: snapshotWalletIds },
      },
    });
  }
};

const summarizeCandidate = (candidate) => ({
  foundCandidate: Boolean(candidate),
  liveWriteEnabled,
  candidate: candidate
    ? {
        orderId: legacyId(candidate.order),
        orderCode: candidate.order.orderCode,
        orderStatus: candidate.order.orderStatus,
        fixtureMode: candidate.fixtureMode,
        clearsPastAssignmentForRider: Boolean(candidate.clearPastAssignmentForRider),
        vendorOrderId: legacyId(candidate.vendorOrder),
        vendorOrderStatus: candidate.vendorOrder.orderStatus,
        vendorId: legacyId(candidate.vendorOrder.restaurant),
        vendorName: candidate.vendorOrder.restaurant?.storeName || null,
        eligibleRiderCount: candidate.eligibleRiders.length,
        firstEligibleRiderId: legacyId(candidate.eligibleRiders[0]),
        firstEligibleRiderName: candidate.eligibleRiders[0]?.name || null,
      }
    : null,
});

const main = async () => {
  const candidate = await findCandidate();
  if (!candidate) {
    console.log(
      JSON.stringify(
        {
          foundCandidate: false,
          liveWriteEnabled,
          reason: "No paid admin-managed vendor order in accepted/preparing/ready_for_pickup has an available verified same-location rider.",
          nextStep: "Re-import local orders/logistics data or create a local fixture order before running the live write smoke.",
        },
        null,
        2
      )
    );
    return;
  }

  if (!liveWriteEnabled) {
    console.log(
      JSON.stringify(
        {
          ...summarizeCandidate(candidate),
          plannedFlow: [
            "vendor order -> ready_for_pickup if needed",
            "temporarily prepare rider/location fixture if needed",
            "broadcast ready order to eligible riders",
            "first eligible rider accepts assignment",
            "rider marks pickup",
            "rider confirms delivery",
            "restore captured Postgres rows and delete smoke-created rows",
          ],
          nextStep: "Set PRISMA_SMOKE_WRITE=1 to run the rollbackable local write smoke.",
        },
        null,
        2
      )
    );
    return;
  }

  const snapshot = await captureSnapshot(candidate);
  const result = {
    ...summarizeCandidate(candidate),
    restored: false,
    steps: [],
  };

  try {
    if (candidate.fixtureMode === "prepared") {
      await prisma.rider.update({
        where: { id: candidate.eligibleRiders[0].id },
        data: {
          status: "available",
          currentOrderId: null,
          assignmentExpiresAt: null,
          cityId: candidate.cityId,
          stateId: candidate.stateId,
        },
      });
      result.steps.push({
        step: "temporary_fixture_prepare",
        success: true,
        riderId: legacyId(candidate.eligibleRiders[0]),
        message: "prepared existing rider as available in the order location",
      });
      if (candidate.clearPastAssignmentForRider) {
        await prisma.riderAssignment.deleteMany({
          where: {
            vendorOrderId: candidate.vendorOrder.id,
            riderId: candidate.eligibleRiders[0].id,
          },
        });
        result.steps.push({
          step: "temporary_assignment_history_clear",
          success: true,
          message: "temporarily cleared this rider's previous assignment history for the vendor order",
        });
      }
    }

    if (candidate.vendorOrder.orderStatus !== "ready_for_pickup") {
      const readyResult = await adminOrdersRepository.updateVendorOrderStatus({
        vendorOrderLegacyId: legacyId(candidate.vendorOrder),
        vendorLegacyId: legacyId(candidate.vendorOrder.restaurant),
        status: "ready_for_pickup",
      });
      result.steps.push({ step: "vendor_ready_for_pickup", success: readyResult.success, message: readyResult.message });
      if (!readyResult.success) throw new Error(readyResult.message || "Vendor ready transition failed");
    } else {
      result.steps.push({ step: "vendor_ready_for_pickup", success: true, message: "already ready_for_pickup" });
    }

    const offerResult = await adminOrdersRepository.offerReadyVendorOrderToAvailableRiders({
      vendorOrderLegacyId: legacyId(candidate.vendorOrder),
      assignedBy: "local-smoke",
    });
    result.steps.push({ step: "rider_broadcast", success: offerResult.success, riderCount: offerResult.riderCount, reason: offerResult.reason || null });
    if (!offerResult.success) throw new Error(offerResult.reason || "Rider broadcast failed");

    const assignment = await prisma.riderAssignment.findFirst({
      where: { vendorOrderId: candidate.vendorOrder.id, status: "pending", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "asc" },
      include: { rider: true },
    });
    if (!assignment?.rider) throw new Error("No pending rider assignment was created");

    const acceptResult = await riderSelfRepository.acceptAssignment(legacyId(assignment.rider), legacyId(candidate.vendorOrder));
    result.steps.push({ step: "rider_accept", success: acceptResult.success, riderId: legacyId(assignment.rider), message: acceptResult.message || null });
    if (!acceptResult.success) throw new Error(acceptResult.message || "Rider accept failed");

    const pickedUpOrder = await riderSelfRepository.markPickedUp(legacyId(candidate.vendorOrder), legacyId(assignment.rider));
    result.steps.push({ step: "rider_pickup", success: Boolean(pickedUpOrder), returnedOrderId: pickedUpOrder?._id || null });

    const deliveryResult = await riderSelfRepository.markDelivered(legacyId(candidate.vendorOrder), legacyId(assignment.rider));
    result.steps.push({
      step: "rider_delivery",
      success: Boolean(deliveryResult?.order),
      payoutCredited: deliveryResult?.payoutCredited || false,
      payoutBlockedReason: deliveryResult?.payoutBlockedReason || null,
      escrowReleaseFailureCount: deliveryResult?.escrowReleaseFailures?.length || 0,
    });
  } finally {
    await restoreSnapshot(snapshot);
    result.restored = true;
  }

  console.log(JSON.stringify(result, null, 2));
};

main()
  .catch((error) => {
    console.error("Rider assignment write smoke failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
