import prisma from "../../config/prisma.js";
import { deliveryContentsFrom } from "./deliveryContents.js";
import { sendOrderNotification, sendVendorNotification } from "../notification.service.js";

const SOURCE_MELACHOW = "MelaChow";
const TERMINAL_STATUSES = new Set([8, 9, 10]);
const STATUS_BY_NAME = Object.freeze({ Pending: 1, SearchingForRider: 2, Assigned: 3, Accepted: 4, ArrivedAtPickup: 5, PickedUp: 6, InTransit: 7, Delivered: 8, Cancelled: 9, Failed: 10 });

export const deliveryProvider = () => String(process.env.DELIVERY_PROVIDER || "melachow").trim().toLowerCase();
export const usesSamkaLogistics = () => deliveryProvider() === "samka";

const numberFrom = (...values) => {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const locationFrom = (value = {}, fallbackAddress = "") => ({
  latitude: numberFrom(value.latitude, value.lat, value.coordinates?.lat, value.location?.lat),
  longitude: numberFrom(value.longitude, value.lng, value.lon, value.coordinates?.lng, value.location?.lng),
  address: String(value.formattedAddress || value.addressLine || value.address || fallbackAddress || "").trim(),
  landmark: value.landmark ? String(value.landmark) : null,
  city: String(value.cityName || value.city || "").trim(),
});

const assertLocation = (location, label) => {
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || !location.address) {
    throw new Error(`${label} requires verified latitude, longitude, and a formatted address`);
  }
};

const config = () => {
  const baseUrl = String(process.env.SAMKA_LOGISTICS_BASE_URL || "").replace(/\/$/, "");
  const sourceKey = String(process.env.SAMKA_LOGISTICS_SOURCE_KEY || "");
  if (!baseUrl || !sourceKey) throw new Error("SAMKA_LOGISTICS_BASE_URL and SAMKA_LOGISTICS_SOURCE_KEY are required");
  return { baseUrl, sourceKey };
};

const request = async (path, init = {}) => {
  const { baseUrl, sourceKey } = config();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.SAMKA_LOGISTICS_TIMEOUT_MS || 10000));
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-Logistics-Source-Key": sourceKey, ...init.headers },
    });
    const raw = await response.text();
    let body = raw;
    try { body = raw ? JSON.parse(raw) : null; } catch { /* retain diagnostic text */ }
    if (!response.ok) {
      const error = new Error(`Samka Logistics request failed with status ${response.status}`);
      error.statusCode = response.status;
      error.responseBody = body;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
};

const deliveryIdFrom = (result) => {
  const response = result?.data && typeof result.data === "object" ? result.data : result;
  return typeof response === "string" ? response : response?.id || response?.deliveryId || null;
};

async function verifySamkaDeliveryIdentity(externalDeliveryId, delivery) {
  const remote = await request(`/api/source-deliveries/${externalDeliveryId}?source=${SOURCE_MELACHOW}`);
  // Samka's DeliveryJobDto names the source reference "orderNumber".
  const remoteReference = remote?.sourceOrderReference ?? remote?.orderNumber;
  if (String(remote?.sourceOrderId || "") !== String(delivery.sourceOrderId)
    || String(remoteReference || "") !== String(delivery.sourceOrderReference)) {
    throw new Error("Samka delivery identity does not match the MelaChow vendor order");
  }
  return remote;
}

const buildPayload = (delivery) => {
  const vendorOrder = delivery.vendorOrder;
  const order = vendorOrder.userOrder;
  const vendor = vendorOrder.restaurant;
  const pickup = locationFrom({
    ...(vendor.address && typeof vendor.address === "object" ? vendor.address : {}),
    latitude: vendor.pickupLatitude,
    longitude: vendor.pickupLongitude,
    formattedAddress: vendor.pickupFormattedAddress,
  }, vendor.storeName);
  const dropoff = locationFrom(order.deliveryAddress || {});
  assertLocation(pickup, "Vendor pickup location");
  assertLocation(dropoff, "Customer delivery location");

  // Platform-managed vendor orders intentionally store deliveryShare as zero. Use the
  // customer order's per-vendor quote (kobo) as the source of truth for rider earnings.
  const vendorDeliveryFee = (order.vendorDeliveryFees || []).find(
    (entry) => String(entry.restaurantId) === String(vendorOrder.restaurantId),
  );
  const feeKobo = Number(vendorDeliveryFee?.deliveryFee ?? order.deliveryFee ?? vendorOrder.deliveryShare ?? 0);
  const estimatedFee = Number((feeKobo / 100).toFixed(2));
  const riderCommission = Number(process.env.SAMKA_RIDER_COMMISSION_NAIRA || 0);
  const distanceEntry = order.vendorDeliveryFees?.find((entry) => entry.restaurantId === vendorOrder.restaurantId);
  if (estimatedFee < 0 || riderCommission < 0 || riderCommission > estimatedFee) {
    throw new Error("Samka delivery fee configuration is invalid");
  }

  return {
    source: SOURCE_MELACHOW,
    sourceOrderId: delivery.sourceOrderId,
    sourceOrderReference: delivery.sourceOrderReference,
    pickup,
    dropoff,
    requiredVehicleType: String(process.env.SAMKA_REQUIRED_VEHICLE_TYPE || "Motorcycle"),
    estimatedDistance: Number(((distanceEntry?.distanceMeters || 0) / 1000).toFixed(3)),
    estimatedFee,
    commercialPolicyVersion: Number(process.env.SAMKA_COMMERCIAL_POLICY_VERSION || 1),
    riderCommission,
    currency: "NGN",
    ...deliveryContentsFrom(vendorOrder),
    pickupContactPhone: vendor.phone || null,
    dropoffContactPhone: order.phone || null,
  };
};

export async function queueSamkaDelivery(vendorOrderId) {
  const vendorOrder = await prisma.vendorOrder.findUnique({
    where: { id: vendorOrderId },
    select: { id: true, userOrder: { select: { orderCode: true } } },
  });
  if (!vendorOrder) throw new Error("Vendor order not found while queuing Samka delivery");
  return prisma.logisticsDelivery.upsert({
    where: { vendorOrderId },
    create: {
      vendorOrderId,
      sourceOrderId: vendorOrderId,
      sourceOrderReference: `${vendorOrder.userOrder.orderCode}:${vendorOrderId.slice(0, 8)}`,
    },
    update: {},
  });
}

const loadDelivery = (id) => prisma.logisticsDelivery.findUnique({
  where: { id },
  include: {
    vendorOrder: {
      include: {
        restaurant: true,
        userOrder: { include: { vendorDeliveryFees: true } },
      },
    },
  },
});

export async function dispatchSamkaDelivery(id) {
  const delivery = await loadDelivery(id);
  if (!delivery || delivery.externalDeliveryId || delivery.dispatchStatus === "dispatched") return delivery;
  const now = new Date();
  // A request can be triggered by both the ready-status handler and the retry
  // worker. Claim the row before making the external POST so those paths cannot
  // create two jobs for the same vendor order concurrently.
  const leaseExpiredBefore = new Date(Date.now() - 2 * 60_000);
  const claim = await prisma.logisticsDelivery.updateMany({
    where: {
      id,
      externalDeliveryId: null,
      OR: [
        { dispatchStatus: { in: ["pending", "retry"] } },
        { dispatchStatus: "dispatching", lastAttemptAt: { lt: leaseExpiredBefore } },
      ],
    },
    data: { dispatchStatus: "dispatching", lastAttemptAt: now, attempts: { increment: 1 } },
  });
  if (!claim.count) return loadDelivery(id);
  const attempt = delivery.attempts + 1;
  try {
    const payload = buildPayload(delivery);
    const result = await request("/api/source-deliveries", { method: "POST", body: JSON.stringify(payload) });
    const response = result?.data && typeof result.data === "object" ? result.data : result;
    const externalDeliveryId = deliveryIdFrom(result);
    if (!externalDeliveryId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(externalDeliveryId))) {
      throw new Error("Samka Logistics did not return a valid delivery ID");
    }
    if (response?.sourceOrderId && String(response.sourceOrderId) !== String(delivery.sourceOrderId)) {
      throw new Error("Samka Logistics returned a delivery for a different source order");
    }
    if (response?.sourceOrderReference && String(response.sourceOrderReference) !== String(delivery.sourceOrderReference)) {
      throw new Error("Samka Logistics returned a delivery with a different order reference");
    }
    const remote = await verifySamkaDeliveryIdentity(externalDeliveryId, delivery);
    const remoteStatus = STATUS_BY_NAME[remote?.status] || Number(remote?.status) || 1;
    const saved = await prisma.logisticsDelivery.updateMany({
      where: { id, externalDeliveryId: null, dispatchStatus: "dispatching", lastAttemptAt: now },
      data: { externalDeliveryId, externalStatus: remoteStatus, dispatchStatus: "dispatched", lastSyncedAt: now, lastError: null, requestPayload: payload, responsePayload: remote },
    });
    if (!saved.count) {
      const current = await loadDelivery(id);
      if (current?.externalDeliveryId === externalDeliveryId) return current;
      throw new Error("Samka delivery claim changed before its response could be saved; reconcile by source order before retrying");
    }
    return loadDelivery(id);
  } catch (error) {
    await prisma.logisticsDelivery.updateMany({
      where: { id, dispatchStatus: "dispatching", lastAttemptAt: now },
      data: { dispatchStatus: "retry", nextAttemptAt: new Date(Date.now() + Math.min(15 * 60_000, 30_000 * (2 ** Math.min(attempt - 1, 5)))), lastError: error.message.slice(0, 1000) },
    });
    throw error;
  }
}

const parentStatus = (statuses) => {
  if (statuses.length === 1) return statuses[0];
  if (statuses.every((s) => s === "completed")) return "completed";
  if (statuses.every((s) => s === "delivered" || s === "completed")) return "delivered";
  for (const status of ["out_for_delivery", "rider_assigned", "ready_for_pickup", "preparing", "accepted", "pending"]) {
    if (statuses.includes(status)) return status;
  }
  return statuses.every((s) => s === "cancelled") ? "cancelled" : "pending";
};

async function applyExternalStatus(delivery, externalStatus, responsePayload) {
  const mapped = externalStatus >= 6 ? "out_for_delivery" : externalStatus >= 4 ? "rider_assigned" : "ready_for_pickup";
  const transition = await prisma.$transaction(async (tx) => {
    const current = await tx.vendorOrder.findUnique({ where: { id: delivery.vendorOrderId }, include: { userOrder: { include: { vendorOrders: true } }, restaurant: true } });
    if (!current) throw new Error("Vendor order no longer exists");
    const freshDelivery = await tx.logisticsDelivery.findUnique({ where: { id: delivery.id }, select: { externalStatus: true } });
    if (Number.isFinite(Number(freshDelivery?.externalStatus)) && Number(freshDelivery.externalStatus) > externalStatus) {
      return { stale: true, changed: false, externalChanged: false, status: current.orderStatus, customerMilestone: null };
    }
    let nextVendorStatus = mapped;

    if (externalStatus === 8) {
      nextVendorStatus = "delivered";
      if (!current.escrowReleased) {
        const amount = Number(current.escrowAmount || 0);
        const adminWallet = await tx.wallet.findFirst({ where: { ownerModel: "Admin" }, orderBy: { createdAt: "asc" } });
        if (amount > 0 && (!adminWallet || adminWallet.balance < amount)) throw new Error("Cannot release vendor escrow: admin wallet balance is insufficient");
        const vendorWallet = await tx.wallet.upsert({ where: { ownerId_ownerModel: { ownerId: current.restaurantId, ownerModel: "Vendor" } }, create: { ownerId: current.restaurantId, ownerModel: "Vendor", balance: 0, totalEarned: 0 }, update: {} });
        if (amount > 0) {
          await tx.wallet.update({ where: { id: adminWallet.id }, data: { balance: { decrement: amount } } });
          await tx.wallet.update({ where: { id: vendorWallet.id }, data: { balance: { increment: amount }, totalEarned: { increment: amount } } });
          await tx.walletTransaction.createMany({ data: [
            { walletId: adminWallet.id, type: "debit", amount, description: `Escrow release to vendor for VendorOrder ${current.id}`, transactionType: "escrow_release", orderId: current.userOrderId, metadata: { logisticsProvider: "samka", externalDeliveryId: delivery.externalDeliveryId } },
            { walletId: vendorWallet.id, type: "credit", amount, description: `Food revenue released from escrow for VendorOrder ${current.id}`, transactionType: "escrow_release", orderId: current.userOrderId, metadata: { logisticsProvider: "samka", externalDeliveryId: delivery.externalDeliveryId } },
          ] });
        }
      }
    }

    const siblingStatuses = current.userOrder.vendorOrders.map((row) => row.id === current.id ? nextVendorStatus : row.orderStatus);
    const changed = current.orderStatus !== nextVendorStatus;
    const statusLog = Array.isArray(current.userOrder.statusLog) ? current.userOrder.statusLog : [];
    await tx.vendorOrder.update({ where: { id: current.id }, data: { orderStatus: nextVendorStatus, ...(externalStatus === 8 ? { escrowReleased: true } : {}) } });
    const assignedRider = responsePayload?.rider || responsePayload?.data?.rider || delivery.assignedRider || current.userOrder.riderAssignment?.rider || null;
    const assignment = current.userOrder.riderAssignment && typeof current.userOrder.riderAssignment === "object"
      ? current.userOrder.riderAssignment : {};
    const notifiedMilestones = assignment.customerNotifiedMilestones && typeof assignment.customerNotifiedMilestones === "object"
      ? assignment.customerNotifiedMilestones : {};
    const previousCustomerMilestone = Number(notifiedMilestones[delivery.externalDeliveryId] || 0);
    const customerMilestone = [4, 5, 7, 8].includes(externalStatus) && externalStatus > previousCustomerMilestone
      ? externalStatus : null;
    await tx.order.update({ where: { id: current.userOrderId }, data: {
      orderStatus: parentStatus(siblingStatuses),
      riderAssignment: {
        ...assignment,
        provider: "samka",
        externalDeliveryId: delivery.externalDeliveryId,
        status: nextVendorStatus,
        externalStatus,
        rider: assignedRider,
        ...(customerMilestone ? { customerNotifiedMilestones: { ...notifiedMilestones, [delivery.externalDeliveryId]: customerMilestone } } : {}),
      },
      statusLog: changed ? [...statusLog, { status: nextVendorStatus, changedBy: "samka_logistics", timestamp: new Date().toISOString() }] : statusLog,
    } });
    await tx.logisticsDelivery.update({ where: { id: delivery.id }, data: { externalStatus, dispatchStatus: TERMINAL_STATUSES.has(externalStatus) ? "terminal" : "dispatched", lastSyncedAt: new Date(), lastError: null, responsePayload, assignedRider } });
    return {
      changed,
      externalChanged: freshDelivery?.externalStatus !== externalStatus,
      externalStatus,
      status: nextVendorStatus,
      customerMilestone,
      orderId: current.userOrder.orderCode,
      orderDatabaseId: current.userOrder.legacyMongoId || current.userOrder.id,
      userId: current.userOrder.user?.legacyMongoId || current.userOrder.userId,
      vendorId: current.restaurant?.legacyMongoId || current.restaurantId,
      vendorOrderId: current.legacyMongoId || current.id,
      restaurantName: current.restaurant?.storeName,
      riderName: assignedRider?.name || null,
      rider: assignedRider,
    };
  }, { isolationLevel: "Serializable" });
  if (transition.stale) return transition;
  if (transition.changed || transition.customerMilestone || (transition.externalChanged && [5, 7].includes(externalStatus))) await notifySamkaOrderTransition(transition);
  return transition;
}

async function notifySamkaOrderTransition(transition) {
  const { status, externalStatus, customerMilestone, orderId, orderDatabaseId, userId, vendorId, vendorOrderId, restaurantName, riderName } = transition;
  const milestoneStatus = ({ 4: "rider_assigned", 5: "rider_arrived", 7: "rider_on_the_way", 8: "delivered" })[customerMilestone];
  const shouldNotifyCustomer = Boolean(milestoneStatus) || ["cancelled", "failed"].includes(status);
  const notifications = shouldNotifyCustomer ? [sendOrderNotification(userId, orderId, milestoneStatus || status, {
    orderId, orderDatabaseId, restaurantName, riderName,
  })] : [];
  const vendorType = externalStatus === 5 || externalStatus === 7 ? "general"
    : status === "rider_assigned" ? "vendor_rider_assigned"
    : status === "delivered" ? "vendor_order_delivered" : "general";
  const vendorDetails = {
    orderId,
    orderDatabaseId: vendorOrderId,
    restaurantName,
    riderName,
    ...(status === "out_for_delivery" ? { title: "Order picked up", message: `Order #${orderId} was picked up and is on its way to the customer.` } : {}),
    ...(externalStatus === 5 ? { title: "Rider at restaurant", message: `The rider has arrived to collect Order #${orderId}.` } : {}),
    ...(externalStatus === 7 ? { title: "Rider on the way", message: `The rider is on the way to the customer with Order #${orderId}.` } : {}),
    ...(["cancelled", "failed"].includes(status) ? { title: "Delivery update", message: `Delivery for Order #${orderId} was ${status}. Check the order for details.` } : {}),
  };
  notifications.push(sendVendorNotification(vendorId, orderId, vendorType, vendorDetails));
  const results = await Promise.allSettled(notifications);
  results.forEach((result, index) => {
    if (result.status === "rejected") console.error(`Samka ${index === 0 && shouldNotifyCustomer ? "customer" : "vendor"} notification failed for ${orderId}:`, result.reason);
  });
}

async function applyTerminalStatus(delivery, status, responsePayload, reason) {
  const nextStatus = status === 9 ? "cancelled" : "failed";
  const transition = await prisma.$transaction(async (tx) => {
    const current = await tx.vendorOrder.findUnique({ where: { id: delivery.vendorOrderId }, include: { userOrder: { include: { vendorOrders: true } }, restaurant: true } });
    if (!current) throw new Error("Vendor order was not found");
    const changed = current.orderStatus !== nextStatus;
    const siblingStatuses = current.userOrder.vendorOrders.map((row) => row.id === current.id ? nextStatus : row.orderStatus);
    const statusLog = Array.isArray(current.userOrder.statusLog) ? current.userOrder.statusLog : [];
    await tx.vendorOrder.update({ where: { id: current.id }, data: { orderStatus: nextStatus } });
    await tx.order.update({ where: { id: current.userOrderId }, data: { orderStatus: parentStatus(siblingStatuses), riderAssignment: { provider: "samka", externalDeliveryId: delivery.externalDeliveryId, status: nextStatus }, statusLog: changed ? [...statusLog, { status: nextStatus, changedBy: "samka_logistics", timestamp: new Date().toISOString() }] : statusLog } });
    await tx.logisticsDelivery.update({ where: { id: delivery.id }, data: { externalStatus: status, dispatchStatus: "terminal", lastSyncedAt: new Date(), lastError: reason, responsePayload } });
    return {
      changed,
      status: nextStatus,
      orderId: current.userOrder.orderCode,
      orderDatabaseId: current.userOrder.legacyMongoId || current.userOrder.id,
      userId: current.userOrder.userId,
      vendorId: current.restaurant?.legacyMongoId || current.restaurantId,
      vendorOrderId: current.legacyMongoId || current.id,
      restaurantName: current.restaurant?.storeName,
    };
  });
  if (transition.changed) await notifySamkaOrderTransition(transition);
  return transition;
}

export async function ensureSamkaDeliveryContents(delivery, remote) {
  // Older Samka deployments do not return items: wait until the new contract is available.
  if (!Array.isArray(remote?.items)) return;
  const full = await loadDelivery(delivery.id);
  if (!full) return;
  const contents = deliveryContentsFrom(full.vendorOrder);
  const needsStore = !remote.pickupBusinessName && contents.pickupBusinessName;
  const needsItems = remote.items.length === 0 && contents.items.length > 0;
  if (!needsStore && !needsItems) return;
  const payload = buildPayload(full);
  const result = await request("/api/source-deliveries", { method: "POST", body: JSON.stringify(payload) });
  const id = typeof result === "string" ? result : result?.id || result?.deliveryId;
  if (id !== delivery.externalDeliveryId) throw new Error("Samka contents update did not return the existing delivery");
  await prisma.logisticsDelivery.update({ where: { id: delivery.id }, data: { requestPayload: payload } });
}
export async function reconcileSamkaDelivery(delivery) {
  let result;
  try {
    result = await request(`/api/source-deliveries/${delivery.externalDeliveryId}?source=${SOURCE_MELACHOW}`);
  } catch (error) {
    // An idempotent POST by sourceOrderId recovers Samka's canonical ID if a
    // stale MelaChow mapping points elsewhere. Verify both order identifiers
    // before changing the stored external ID.
    if (error.statusCode !== 404) throw error;
    const fullDelivery = await loadDelivery(delivery.id);
    if (!fullDelivery) throw new Error("MelaChow source delivery no longer exists");
    const payload = buildPayload(fullDelivery);
    const createResult = await request("/api/source-deliveries", { method: "POST", body: JSON.stringify(payload) });
    const canonicalId = deliveryIdFrom(createResult);
    if (!canonicalId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(canonicalId))) {
      throw new Error("Samka could not return a canonical delivery ID for this source order");
    }
    result = await verifySamkaDeliveryIdentity(canonicalId, fullDelivery);
    await prisma.logisticsDelivery.update({
      where: { id: delivery.id },
      data: { externalDeliveryId: canonicalId, lastError: null, lastSyncedAt: new Date(), responsePayload: result },
    });
    delivery = { ...delivery, externalDeliveryId: canonicalId };
  }
  const status = typeof result?.status === "string" && STATUS_BY_NAME[result.status]
    ? STATUS_BY_NAME[result.status]
    : Number(result?.status);
  if (!Number.isInteger(status)) throw new Error("Samka Logistics status response is invalid");
  if (status === 9 || status === 10) {
    await applyTerminalStatus(delivery, status, result, result?.cancellationReason || result?.failureReason || `Samka terminal status ${status}`);
    return;
  }
  await applyExternalStatus(delivery, status, result);
  if (!TERMINAL_STATUSES.has(status)) await ensureSamkaDeliveryContents(delivery, result);
}

export async function cancelSamkaDelivery(externalDeliveryId, reason = "Cancelled by MelaChow") {
  return request(`/api/source-deliveries/${externalDeliveryId}/cancel?source=${SOURCE_MELACHOW}`, {
    method: "POST",
    body: JSON.stringify(String(reason || "Cancelled by MelaChow")),
  });
}

export async function cancelQueuedSamkaDeliveryForVendorOrder(vendorOrderId, reason) {
  const delivery = await prisma.logisticsDelivery.findUnique({ where: { vendorOrderId } });
  if (!delivery || delivery.dispatchStatus === "terminal") return delivery;
  if (delivery.externalDeliveryId) await cancelSamkaDelivery(delivery.externalDeliveryId, reason);
  return prisma.logisticsDelivery.update({
    where: { id: delivery.id },
    data: { dispatchStatus: "terminal", externalStatus: 9, lastError: String(reason || "Cancelled by MelaChow"), lastSyncedAt: new Date() },
  });
}

export async function processSamkaCallback({ eventType, externalDeliveryId, sourceOrderId, data = {}, payload = {} }) {
  const normalizedExternalId = String(externalDeliveryId || "").trim();
  const normalizedSourceId = String(sourceOrderId || "").trim();
  const delivery = await prisma.logisticsDelivery.findFirst({
    where: normalizedExternalId ? { externalDeliveryId: normalizedExternalId } : { sourceOrderId: normalizedSourceId },
    include: { vendorOrder: { include: { userOrder: true } } },
  });
  if (!delivery) throw new Error("MelaChow logistics delivery was not found");
  if (normalizedSourceId && normalizedSourceId !== String(delivery.sourceOrderId)) {
    throw new Error("Samka callback source order does not match the mapped MelaChow delivery");
  }

  if (eventType === "delivery.rider.location.updated") {
    const latitude = numberFrom(data.latitude);
    const longitude = numberFrom(data.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Rider location callback is invalid");
    const riderLocation = { latitude, longitude, heading: numberFrom(data.heading), speed: numberFrom(data.speed), updatedAt: new Date().toISOString() };
    await prisma.logisticsDelivery.update({ where: { id: delivery.id }, data: { riderLocation, lastSyncedAt: new Date(), responsePayload: payload } });
    return { delivery, riderLocation, statusChanged: false };
  }

  const statusByEvent = {
    "delivery.rider.assigned": 4,
    "delivery.completed": 8,
    "delivery.cancelled": 9,
    "delivery.failed": 10,
  };
  const statusFromData = data.status;
  const statusFromName = typeof statusFromData === "string" ? STATUS_BY_NAME[statusFromData] : null;
  const status = statusByEvent[eventType] || (eventType === "delivery.status.changed" ? statusFromName || Number(statusFromData) : null);
  if (!Number.isInteger(status) || status < 1 || status > 10) return { delivery, ignored: true, statusChanged: false };
  if (status === 9 || status === 10) {
    const transition = await applyTerminalStatus(delivery, status, payload, data.reason || eventType);
    return { delivery, status: transition.status, statusChanged: transition.changed };
  }

  const transition = await applyExternalStatus(delivery, status, { ...payload, rider: data.rider || delivery.assignedRider || null });
  return { delivery, status: transition.status, statusChanged: transition.changed, rider: transition.rider };
}

export async function assertSamkaSchemaReady() {
  if (!usesSamkaLogistics()) return;
  // Validate the schema before the HTTP listener and retry workers start.
  await prisma.$queryRaw`SELECT assigned_rider, rider_location FROM logistics_deliveries LIMIT 0`;
  await prisma.$queryRaw`SELECT event_id FROM logistics_callback_events LIMIT 0`;
}

export async function recoverMissingSamkaHandoffs(limit = 20) {
  const readyOrders = await prisma.vendorOrder.findMany({
    where: {
      orderStatus: "ready_for_pickup",
      riderId: null,
      restaurant: { deliveryManagedBy: "admin" },
      userOrder: { paymentStatus: "paid", orderStatus: "ready_for_pickup", riderId: null },
      logisticsDelivery: { is: null },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  for (const order of readyOrders) await queueSamkaDelivery(order.id);
  return readyOrders.length;
}

export async function processSamkaLogistics() {
  if (!usesSamkaLogistics()) return { dispatched: 0, reconciled: 0, failed: 0 };
  const result = { dispatched: 0, reconciled: 0, failed: 0 };
  await recoverMissingSamkaHandoffs();
  const now = new Date();
  const staleDispatchBefore = new Date(now.getTime() - 2 * 60_000);
  const pending = await prisma.logisticsDelivery.findMany({
    where: {
      externalDeliveryId: null,
      OR: [
        { dispatchStatus: { in: ["pending", "retry"] }, nextAttemptAt: { lte: now } },
        { dispatchStatus: "dispatching", lastAttemptAt: { lt: staleDispatchBefore } },
      ],
    },
    take: 20,
    orderBy: { createdAt: "asc" },
  });
  for (const delivery of pending) {
    try { await dispatchSamkaDelivery(delivery.id); result.dispatched += 1; } catch { result.failed += 1; }
  }
  const active = await prisma.logisticsDelivery.findMany({ where: { externalDeliveryId: { not: null }, dispatchStatus: "dispatched" }, take: 50, orderBy: { lastSyncedAt: "asc" } });
  for (const delivery of active) {
    try {
      await reconcileSamkaDelivery(delivery);
      result.reconciled += 1;
    } catch (error) { result.failed += 1; await prisma.logisticsDelivery.update({ where: { id: delivery.id }, data: { lastError: error.message.slice(0, 1000), lastSyncedAt: new Date() } }); }
  }
  return result;
}
