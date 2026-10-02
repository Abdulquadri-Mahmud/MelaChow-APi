import prisma from "../../config/prisma.js";

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
    if (!response.ok) throw new Error(`Samka Logistics request failed with status ${response.status}`);
    return body;
  } finally {
    clearTimeout(timeout);
  }
};

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

  const feeKobo = Number(vendorOrder.deliveryShare ?? order.deliveryFee ?? 0);
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
  try {
    const payload = buildPayload(delivery);
    const result = await request("/api/source-deliveries", { method: "POST", body: JSON.stringify(payload) });
    const externalDeliveryId = typeof result === "string" ? result : result?.id || result?.deliveryId;
    if (!externalDeliveryId) throw new Error("Samka Logistics did not return a delivery ID");
    return await prisma.logisticsDelivery.update({
      where: { id },
      data: { externalDeliveryId, externalStatus: 1, dispatchStatus: "dispatched", attempts: { increment: 1 }, lastAttemptAt: now, lastSyncedAt: now, lastError: null, requestPayload: payload, responsePayload: result },
    });
  } catch (error) {
    const attempts = delivery.attempts + 1;
    await prisma.logisticsDelivery.update({
      where: { id },
      data: { dispatchStatus: "retry", attempts, lastAttemptAt: now, nextAttemptAt: new Date(Date.now() + Math.min(15 * 60_000, 30_000 * (2 ** Math.min(attempts - 1, 5)))), lastError: error.message.slice(0, 1000) },
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
  const mapped = externalStatus >= 6 ? "out_for_delivery" : externalStatus >= 3 ? "rider_assigned" : "ready_for_pickup";
  await prisma.$transaction(async (tx) => {
    const current = await tx.vendorOrder.findUnique({ where: { id: delivery.vendorOrderId }, include: { userOrder: { include: { vendorOrders: true } }, restaurant: true } });
    if (!current) throw new Error("Vendor order no longer exists");
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
    const statusLog = Array.isArray(current.userOrder.statusLog) ? current.userOrder.statusLog : [];
    await tx.vendorOrder.update({ where: { id: current.id }, data: { orderStatus: nextVendorStatus, ...(externalStatus === 8 ? { escrowReleased: true } : {}) } });
    const assignedRider = responsePayload?.rider || responsePayload?.data?.rider || delivery.assignedRider || null;
    await tx.order.update({ where: { id: current.userOrderId }, data: { orderStatus: parentStatus(siblingStatuses), riderAssignment: { provider: "samka", externalDeliveryId: delivery.externalDeliveryId, status: nextVendorStatus, rider: assignedRider }, statusLog: [...statusLog, { status: nextVendorStatus, changedBy: "samka_logistics", timestamp: new Date().toISOString() }] } });
    await tx.logisticsDelivery.update({ where: { id: delivery.id }, data: { externalStatus, dispatchStatus: TERMINAL_STATUSES.has(externalStatus) ? "terminal" : "dispatched", lastSyncedAt: new Date(), lastError: null, responsePayload, assignedRider } });
  });
}

export async function reconcileSamkaDelivery(delivery) {
  const result = await request(`/api/source-deliveries/${delivery.externalDeliveryId}?source=${SOURCE_MELACHOW}`);
  const status = typeof result?.status === "string" && STATUS_BY_NAME[result.status]
    ? STATUS_BY_NAME[result.status]
    : Number(result?.status);
  if (!Number.isInteger(status)) throw new Error("Samka Logistics status response is invalid");
  if (status === 9 || status === 10) {
    await prisma.logisticsDelivery.update({ where: { id: delivery.id }, data: { externalStatus: status, dispatchStatus: "terminal", lastSyncedAt: new Date(), responsePayload: result, lastError: result?.cancellationReason || result?.failureReason || `Samka terminal status ${status}` } });
    return;
  }
  await applyExternalStatus(delivery, status, result);
}

export async function getSamkaDeliveryDetails(externalDeliveryId) {
  return request(`/api/source-deliveries/${externalDeliveryId}/details?source=${SOURCE_MELACHOW}`);
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
  const delivery = await prisma.logisticsDelivery.findFirst({
    where: externalDeliveryId ? { externalDeliveryId } : { sourceOrderId: String(sourceOrderId || "") },
    include: { vendorOrder: { include: { userOrder: true } } },
  });
  if (!delivery) throw new Error("MelaChow logistics delivery was not found");

  if (eventType === "delivery.rider.location.updated") {
    const latitude = numberFrom(data.latitude);
    const longitude = numberFrom(data.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("Rider location callback is invalid");
    const riderLocation = { latitude, longitude, heading: numberFrom(data.heading), speed: numberFrom(data.speed), updatedAt: new Date().toISOString() };
    await prisma.logisticsDelivery.update({ where: { id: delivery.id }, data: { riderLocation, lastSyncedAt: new Date(), responsePayload: payload } });
    return { delivery, riderLocation, statusChanged: false };
  }

  const statusByEvent = {
    "delivery.rider.assigned": 3,
    "delivery.completed": 8,
    "delivery.cancelled": 9,
    "delivery.failed": 10,
  };
  const status = statusByEvent[eventType];
  if (!status) return { delivery, ignored: true, statusChanged: false };
  if (status === 9 || status === 10) {
    const nextStatus = status === 9 ? "cancelled" : "failed";
    await prisma.$transaction(async (tx) => {
      const current = await tx.vendorOrder.findUnique({ where: { id: delivery.vendorOrderId }, include: { userOrder: { include: { vendorOrders: true } } } });
      if (!current) throw new Error("Vendor order was not found");
      const siblingStatuses = current.userOrder.vendorOrders.map((row) => row.id === current.id ? nextStatus : row.orderStatus);
      const statusLog = Array.isArray(current.userOrder.statusLog) ? current.userOrder.statusLog : [];
      await tx.vendorOrder.update({ where: { id: current.id }, data: { orderStatus: nextStatus } });
      await tx.order.update({ where: { id: current.userOrderId }, data: { orderStatus: parentStatus(siblingStatuses), riderAssignment: { provider: "samka", externalDeliveryId: delivery.externalDeliveryId, status: nextStatus }, statusLog: [...statusLog, { status: nextStatus, changedBy: "samka_logistics_callback", timestamp: new Date().toISOString() }] } });
      await tx.logisticsDelivery.update({ where: { id: delivery.id }, data: { externalStatus: status, dispatchStatus: "terminal", lastSyncedAt: new Date(), lastError: data.reason || `${eventType}`, responsePayload: payload } });
    });
    return { delivery, status: nextStatus, statusChanged: true };
  }

  await applyExternalStatus(delivery, status, { ...payload, rider: data.rider || data });
  return { delivery, status: status === 8 ? "delivered" : "rider_assigned", statusChanged: true };
}

export async function processSamkaLogistics() {
  if (!usesSamkaLogistics()) return { dispatched: 0, reconciled: 0, failed: 0 };
  const result = { dispatched: 0, reconciled: 0, failed: 0 };
  const pending = await prisma.logisticsDelivery.findMany({ where: { externalDeliveryId: null, dispatchStatus: { in: ["pending", "retry"] }, nextAttemptAt: { lte: new Date() } }, take: 20, orderBy: { createdAt: "asc" } });
  for (const delivery of pending) {
    try { await dispatchSamkaDelivery(delivery.id); result.dispatched += 1; } catch { result.failed += 1; }
  }
  const active = await prisma.logisticsDelivery.findMany({ where: { externalDeliveryId: { not: null }, dispatchStatus: "dispatched" }, take: 50, orderBy: { lastSyncedAt: "asc" } });
  for (const delivery of active) {
    try {
      await reconcileSamkaDelivery(delivery);
      const details = await getSamkaDeliveryDetails(delivery.externalDeliveryId).catch(() => null);
      if (details?.rider) await prisma.logisticsDelivery.update({ where: { id: delivery.id }, data: { assignedRider: details.rider } });
      result.reconciled += 1;
    } catch (error) { result.failed += 1; await prisma.logisticsDelivery.update({ where: { id: delivery.id }, data: { lastError: error.message.slice(0, 1000), lastSyncedAt: new Date() } }); }
  }
  return result;
}
