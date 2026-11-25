import crypto from "crypto";
import prisma from "../../config/prisma.js";
import { sendIncomingCallFirebasePush } from "../firebasePush.service.js";
import { emitToUser, emitToSamkaRider } from "../../socket/socketServer.js";

export const CALL_STATES = Object.freeze({
  IDLE: "idle",
  INITIATING: "initiating",
  RINGING: "ringing",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  REJECTED: "rejected",
  MISSED: "missed",
  ENDED: "ended",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

export const ACTIVE_CALL_STATES = Object.freeze([
  CALL_STATES.INITIATING,
  CALL_STATES.RINGING,
  CALL_STATES.CONNECTING,
  CALL_STATES.CONNECTED,
]);

export const TERMINAL_CALL_STATES = Object.freeze([
  CALL_STATES.REJECTED,
  CALL_STATES.MISSED,
  CALL_STATES.ENDED,
  CALL_STATES.FAILED,
  CALL_STATES.CANCELLED,
]);

export const ALLOWED_TRANSITIONS = Object.freeze({
  [CALL_STATES.INITIATING]: new Set([
    CALL_STATES.RINGING,
    CALL_STATES.CANCELLED,
    CALL_STATES.FAILED,
  ]),
  [CALL_STATES.RINGING]: new Set([
    CALL_STATES.CONNECTING,
    CALL_STATES.REJECTED,
    CALL_STATES.MISSED,
    CALL_STATES.CANCELLED,
    CALL_STATES.ENDED,
    CALL_STATES.FAILED,
  ]),
  [CALL_STATES.CONNECTING]: new Set([
    CALL_STATES.CONNECTED,
    CALL_STATES.ENDED,
    CALL_STATES.CANCELLED,
    CALL_STATES.FAILED,
  ]),
  [CALL_STATES.CONNECTED]: new Set([CALL_STATES.ENDED, CALL_STATES.FAILED]),
});

const ELIGIBLE_ORDER_STATUSES = new Set(["rider_assigned", "out_for_delivery"]);
const ELIGIBLE_EXTERNAL_DELIVERY_STATUSES = new Set([3, 4, 5, 6, 7]);
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RING_TIMEOUT_MS = Math.max(
  15000,
  Number(process.env.CALL_RING_TIMEOUT_MS) || 35000
);
const CONNECT_TIMEOUT_MS = Math.max(
  10000,
  Number(process.env.CALL_CONNECT_TIMEOUT_MS) || 25000
);
const MAX_CALL_DURATION_MS = Math.max(
  60000,
  Number(process.env.CALL_MAX_DURATION_MS) || 30 * 60 * 1000
);
const DISCONNECT_GRACE_MS = Math.max(
  5000,
  Number(process.env.CALL_DISCONNECT_GRACE_MS) || 15000
);

// Rate limiting: max 6 call initiations per 2 minutes per actor
const RATE_LIMIT_WINDOW_MS = 2 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = Number(process.env.CALL_INITIATE_RATE_LIMIT) || 6;
const initiationAttempts = new Map();

// Active in-process timers keyed by callId
const callTimers = new Map();
// Disconnect grace timers keyed by `${callId}:${role}`
const disconnectTimers = new Map();

// Optional external hooks injected to avoid circular imports with samkaLogistics.service.js
let samkaHooks = {
  notifyRiderCallEvent: null,
  refreshDeliveryRider: null,
};

export function registerSamkaCallHooks(hooks = {}) {
  samkaHooks = { ...samkaHooks, ...hooks };
}

function createCallError(message, statusCode = 400, code = "CALL_ERROR") {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function assertRateLimit(actor) {
  const key = `${actor.role}:${actor.actorId}`;
  const now = Date.now();
  const timestamps = (initiationAttempts.get(key) || []).filter(
    (ts) => now - ts < RATE_LIMIT_WINDOW_MS
  );
  if (timestamps.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    throw createCallError(
      "You are placing calls too quickly. Please wait a moment before trying again.",
      429,
      "RATE_LIMITED"
    );
  }
  timestamps.push(now);
  initiationAttempts.set(key, timestamps);
}

function clearCallTimer(callId) {
  const existing = callTimers.get(callId);
  if (existing) {
    clearTimeout(existing);
    callTimers.delete(callId);
  }
}

export function clearDisconnectGrace(callId, role) {
  const key = `${callId}:${role}`;
  const existing = disconnectTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    disconnectTimers.delete(key);
  }
}

function clearAllCallTimers(callId) {
  clearCallTimer(callId);
  clearDisconnectGrace(callId, "customer");
  clearDisconnectGrace(callId, "rider");
}

function scheduleCallTimeout(callId, delayMs, expectedStatus, handler) {
  clearCallTimer(callId);
  const timer = setTimeout(async () => {
    callTimers.delete(callId);
    try {
      const session = await prisma.callSession.findUnique({ where: { id: callId } });
      if (!session || session.status !== expectedStatus) return;
      await handler(session);
    } catch (err) {
      console.error(`[CALL] Timeout handler failed for ${callId}:`, err.message);
    }
  }, delayMs);
  if (typeof timer.unref === "function") timer.unref();
  callTimers.set(callId, timer);
}

export function serializeCallSession(session, viewerRole = null) {
  if (!session) return null;
  const peerRole = viewerRole
    ? viewerRole === "customer"
      ? "rider"
      : "customer"
    : null;
  return {
    callId: session.id,
    orderId: session.orderId,
    orderCode: session.orderCode,
    vendorOrderId: session.vendorOrderId,
    deliveryId: session.externalDeliveryId || null,
    status: session.status,
    callerRole: session.callerRole,
    calleeRole: session.calleeRole,
    customerName: session.customerDisplayName || "Customer",
    riderName: session.riderDisplayName || "Rider",
    riderAvatar: session.riderAvatarUrl || null,
    peerName:
      peerRole === "rider"
        ? session.riderDisplayName || "Rider"
        : peerRole === "customer"
          ? session.customerDisplayName || "Customer"
          : undefined,
    peerAvatar: peerRole === "rider" ? session.riderAvatarUrl || null : null,
    endReason: session.endReason || null,
    endedByRole: session.endedByRole || null,
    ringingAt: session.ringingAt ? session.ringingAt.toISOString() : null,
    acceptedAt: session.acceptedAt ? session.acceptedAt.toISOString() : null,
    connectedAt: session.connectedAt ? session.connectedAt.toISOString() : null,
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    expiresAt: session.expiresAt ? session.expiresAt.toISOString() : null,
    durationSeconds: session.durationSeconds ?? null,
    createdAt: session.createdAt ? session.createdAt.toISOString() : null,
  };
}

function normalizeRiderInfo(assignedRider) {
  if (!assignedRider || typeof assignedRider !== "object") return null;
  const id = String(
    assignedRider.id || assignedRider.riderId || assignedRider._id || ""
  ).trim();
  const name =
    String(
      assignedRider.fullName || assignedRider.name || "Delivery Rider"
    ).trim() || "Delivery Rider";
  const avatar =
    assignedRider.profileImageUrl || assignedRider.avatar || assignedRider.photo || null;
  if (!id) return null;
  return { id, name, avatar };
}

function buildCustomerDisplayName(user) {
  if (!user) return "Customer";
  const name =
    user.fullName ||
    [user.firstname, user.lastname].filter(Boolean).join(" ").trim() ||
    "Customer";
  return name;
}

async function emitToCustomer(customerId, event, payload) {
  emitToUser(customerId, event, payload);
  try {
    const user = await prisma.user.findUnique({
      where: { id: customerId },
      select: { legacyMongoId: true },
    });
    if (user?.legacyMongoId && user.legacyMongoId !== customerId) {
      emitToUser(user.legacyMongoId, event, payload);
    }
  } catch {
    // Non-fatal fallback
  }
}

export async function emitToSessionParticipant(session, role, event, payload) {
  if (role === "customer") {
    await emitToCustomer(session.customerId, event, payload);
  } else if (role === "rider") {
    emitToSamkaRider(session.riderId, event, payload);
  }
}

async function sendCustomerCallPush(customerId, dataPayload) {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        ownerId: customerId,
        ownerModel: "User",
      },
      select: { id: true, subscription: true },
    });

    const fcmTokens = subscriptions
      .map((row) => ({
        id: row.id,
        token:
          row.subscription && typeof row.subscription === "object"
            ? row.subscription.fcmToken
            : null,
      }))
      .filter((item) => Boolean(item.token));

    await Promise.allSettled(
      fcmTokens.map(async ({ id, token }) => {
        try {
          await sendIncomingCallFirebasePush(token, dataPayload);
        } catch (err) {
          const code = err?.code || "";
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            await prisma.pushSubscription.delete({ where: { id } }).catch(() => {});
          } else {
            console.warn("[CALL] Customer FCM push failed:", err.message);
          }
        }
      })
    );
  } catch (err) {
    console.warn("[CALL] Customer push lookup failed:", err.message);
  }
}

async function sendCalleePushNotification(session, eventType) {
  const basePayload = {
    type: eventType,
    callId: session.id,
    orderId: session.orderId,
    orderCode: session.orderCode,
    vendorOrderId: session.vendorOrderId,
    deliveryId: session.externalDeliveryId || "",
    callerRole: session.callerRole,
    callerName:
      session.callerRole === "customer"
        ? session.customerDisplayName
        : session.riderDisplayName,
    expiresAt: session.expiresAt ? session.expiresAt.toISOString() : "",
    ttlMs: String(RING_TIMEOUT_MS),
  };

  if (session.calleeRole === "customer") {
    await sendCustomerCallPush(session.customerId, basePayload);
  } else if (
    session.calleeRole === "rider" &&
    session.externalDeliveryId &&
    typeof samkaHooks.notifyRiderCallEvent === "function"
  ) {
    try {
      await samkaHooks.notifyRiderCallEvent(session.externalDeliveryId, {
        callId: session.id,
        eventType,
        callerName: session.customerDisplayName || "MelaChow Customer",
        orderReference: session.orderCode,
        sourceOrderId: session.vendorOrderId,
        expiresAt: session.expiresAt ? session.expiresAt.toISOString() : null,
      });
    } catch (err) {
      console.warn(
        `[CALL] Samka rider push relay (${eventType}) failed for delivery ${session.externalDeliveryId}:`,
        err.message
      );
    }
  }
}

async function sendDismissPushToBoth(session, eventType = "call_ended") {
  const payload = {
    type: eventType,
    callId: session.id,
    orderId: session.orderId,
    orderCode: session.orderCode,
    deliveryId: session.externalDeliveryId || "",
    ttlMs: "15000",
  };

  const tasks = [sendCustomerCallPush(session.customerId, payload)];
  if (
    session.externalDeliveryId &&
    typeof samkaHooks.notifyRiderCallEvent === "function"
  ) {
    tasks.push(
      samkaHooks
        .notifyRiderCallEvent(session.externalDeliveryId, {
          callId: session.id,
          eventType,
          callerName: session.customerDisplayName || "MelaChow Customer",
          orderReference: session.orderCode,
          sourceOrderId: session.vendorOrderId,
          expiresAt: null,
        })
        .catch(() => {})
    );
  }
  await Promise.allSettled(tasks);
}

/**
 * Resolves and strictly validates order ownership, active rider assignment,
 * and call-eligible delivery status.
 */
async function resolveAuthorizedDeliveryContext({
  actor,
  orderId,
  vendorOrderId,
  deliveryId,
}) {
  let logisticsDelivery = null;
  let order = null;
  let vendorOrder = null;

  if (deliveryId) {
    const cleanDeliveryId = String(deliveryId).trim();
    if (!UUID_REGEX.test(cleanDeliveryId)) {
      throw createCallError("Invalid delivery reference", 400, "INVALID_DELIVERY_ID");
    }
    logisticsDelivery = await prisma.logisticsDelivery.findUnique({
      where: { externalDeliveryId: cleanDeliveryId },
      include: {
        vendorOrder: {
          include: {
            userOrder: { include: { user: true } },
          },
        },
      },
    });
    if (!logisticsDelivery) {
      throw createCallError("Active delivery not found", 404, "DELIVERY_NOT_FOUND");
    }
    vendorOrder = logisticsDelivery.vendorOrder;
    order = vendorOrder?.userOrder || null;
  } else if (vendorOrderId) {
    const cleanVoId = String(vendorOrderId).trim();
    vendorOrder = await prisma.vendorOrder.findFirst({
      where: UUID_REGEX.test(cleanVoId)
        ? { id: cleanVoId }
        : { legacyMongoId: cleanVoId },
      include: {
        logisticsDelivery: true,
        userOrder: { include: { user: true } },
      },
    });
    if (!vendorOrder) {
      throw createCallError("Order delivery not found", 404, "ORDER_NOT_FOUND");
    }
    logisticsDelivery = vendorOrder.logisticsDelivery;
    order = vendorOrder.userOrder;
  } else if (orderId) {
    const cleanOrderId = String(orderId).trim();
    order = await prisma.order.findFirst({
      where: UUID_REGEX.test(cleanOrderId)
        ? { OR: [{ id: cleanOrderId }, { orderCode: cleanOrderId }] }
        : { OR: [{ legacyMongoId: cleanOrderId }, { orderCode: cleanOrderId }] },
      include: {
        user: true,
        vendorOrders: {
          include: { logisticsDelivery: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!order) {
      throw createCallError("Order not found", 404, "ORDER_NOT_FOUND");
    }
    // Prefer a vendor order with an active assigned Samka delivery
    vendorOrder =
      order.vendorOrders.find(
        (vo) =>
          vo.logisticsDelivery &&
          ELIGIBLE_ORDER_STATUSES.has(vo.orderStatus)
      ) ||
      order.vendorOrders.find((vo) => Boolean(vo.logisticsDelivery)) ||
      order.vendorOrders[0] ||
      null;
    logisticsDelivery = vendorOrder?.logisticsDelivery || null;
  } else {
    throw createCallError(
      "An order or delivery identifier is required to place a call",
      400,
      "MISSING_REFERENCE"
    );
  }

  if (!order || !vendorOrder) {
    throw createCallError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  // Validate order lifecycle status
  if (
    ["delivered", "completed", "cancelled", "failed", "refunded"].includes(
      order.orderStatus
    ) ||
    ["delivered", "completed", "cancelled", "failed", "refunded"].includes(
      vendorOrder.orderStatus
    )
  ) {
    throw createCallError(
      "Calling is no longer available because this order is closed",
      409,
      "ORDER_INELIGIBLE"
    );
  }

  if (!ELIGIBLE_ORDER_STATUSES.has(vendorOrder.orderStatus)) {
    throw createCallError(
      "Calling is available once a rider is assigned to this order",
      409,
      "NO_RIDER_ASSIGNED"
    );
  }

  if (!logisticsDelivery || !logisticsDelivery.externalDeliveryId) {
    throw createCallError(
      "No rider is currently assigned to this delivery",
      409,
      "NO_RIDER_ASSIGNED"
    );
  }

  if (
    logisticsDelivery.dispatchStatus === "terminal" ||
    (logisticsDelivery.externalStatus != null &&
      !ELIGIBLE_EXTERNAL_DELIVERY_STATUSES.has(Number(logisticsDelivery.externalStatus)))
  ) {
    throw createCallError(
      "This delivery is no longer eligible for calling",
      409,
      "DELIVERY_INELIGIBLE"
    );
  }

  // Extract assigned rider snapshot; refresh once from SamkaTech if missing ID
  let riderInfo = normalizeRiderInfo(
    logisticsDelivery.assignedRider || order.riderAssignment?.rider
  );
  if (
    !riderInfo &&
    typeof samkaHooks.refreshDeliveryRider === "function" &&
    logisticsDelivery.externalDeliveryId
  ) {
    try {
      const refreshed = await samkaHooks.refreshDeliveryRider(logisticsDelivery);
      riderInfo = normalizeRiderInfo(refreshed);
    } catch (err) {
      console.warn("[CALL] Rider snapshot refresh failed:", err.message);
    }
  }

  if (!riderInfo) {
    throw createCallError(
      "No rider is currently assigned to this order",
      409,
      "NO_RIDER_ASSIGNED"
    );
  }

  // Strict authorization check per caller role
  if (actor.role === "customer") {
    if (String(order.userId) !== String(actor.actorId)) {
      throw createCallError(
        "You are not authorized to place a call for this order",
        403,
        "UNAUTHORIZED_ORDER"
      );
    }
  } else if (actor.role === "rider") {
    if (riderInfo.id.toLowerCase() !== String(actor.actorId).toLowerCase()) {
      throw createCallError(
        "You are not the assigned rider for this delivery",
        403,
        "UNAUTHORIZED_DELIVERY"
      );
    }
  } else {
    throw createCallError("Unauthorized caller role", 403, "UNAUTHORIZED_ROLE");
  }

  return {
    order,
    vendorOrder,
    logisticsDelivery,
    riderInfo,
    customerDisplayName: buildCustomerDisplayName(order.user),
  };
}

export async function initiateCall({
  actor,
  orderId,
  vendorOrderId,
  deliveryId,
}) {
  assertRateLimit(actor);

  const {
    order,
    vendorOrder,
    logisticsDelivery,
    riderInfo,
    customerDisplayName,
  } = await resolveAuthorizedDeliveryContext({
    actor,
    orderId,
    vendorOrderId,
    deliveryId,
  });

  // Check for existing active call on this order or either participant
  const existingActive = await prisma.callSession.findFirst({
    where: {
      status: { in: ACTIVE_CALL_STATES },
      OR: [
        { vendorOrderId: vendorOrder.id },
        { customerId: order.userId },
        { riderId: riderInfo.id },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (existingActive) {
    // Idempotency: if same caller initiated for same order within last 6s, return existing
    const ageMs = Date.now() - existingActive.createdAt.getTime();
    if (
      existingActive.vendorOrderId === vendorOrder.id &&
      existingActive.callerRole === actor.role &&
      existingActive.status === CALL_STATES.RINGING &&
      ageMs < 6000
    ) {
      return serializeCallSession(existingActive, actor.role);
    }

    // Expire stale calls whose expiresAt already passed
    if (
      existingActive.status === CALL_STATES.RINGING &&
      existingActive.expiresAt &&
      existingActive.expiresAt.getTime() <= Date.now()
    ) {
      await markSessionTerminal(existingActive, CALL_STATES.MISSED, "ring_timeout", "system");
    } else {
      throw createCallError(
        existingActive.callerRole === actor.role
          ? "You already have an active call in progress"
          : "The other party is currently on another call",
        409,
        "CALL_IN_PROGRESS"
      );
    }
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + RING_TIMEOUT_MS);
  const callerRole = actor.role;
  const calleeRole = callerRole === "customer" ? "rider" : "customer";

  const session = await prisma.callSession.create({
    data: {
      id: crypto.randomUUID(),
      orderId: order.id,
      vendorOrderId: vendorOrder.id,
      logisticsDeliveryId: logisticsDelivery.id,
      externalDeliveryId: logisticsDelivery.externalDeliveryId,
      customerId: order.userId,
      riderId: riderInfo.id,
      riderProvider: "samka",
      callerRole,
      calleeRole,
      customerDisplayName,
      riderDisplayName: riderInfo.name,
      riderAvatarUrl: riderInfo.avatar,
      orderCode: order.orderCode,
      status: CALL_STATES.RINGING,
      ringingAt: now,
      expiresAt,
    },
  });

  // Schedule ringing timeout -> missed
  scheduleCallTimeout(session.id, RING_TIMEOUT_MS, CALL_STATES.RINGING, async (stale) => {
    await markSessionTerminal(stale, CALL_STATES.MISSED, "no_answer", "system");
  });

  // Notify caller (ringing) & callee (incoming) via Socket.IO
  await emitToSessionParticipant(
    session,
    callerRole,
    "call:ringing",
    serializeCallSession(session, callerRole)
  );
  await emitToSessionParticipant(
    session,
    calleeRole,
    "call:incoming",
    serializeCallSession(session, calleeRole)
  );

  // Wake callee via high-priority FCM push (customer FCM / SamkaTech rider FCM relay)
  await sendCalleePushNotification(session, "incoming_call");

  return serializeCallSession(session, actor.role);
}

function assertActorBelongsToSession(session, actor) {
  if (!session) {
    throw createCallError("Call session not found", 404, "CALL_NOT_FOUND");
  }
  const isCustomer =
    actor.role === "customer" && String(session.customerId) === String(actor.actorId);
  const isRider =
    actor.role === "rider" &&
    String(session.riderId).toLowerCase() === String(actor.actorId).toLowerCase();

  if (!isCustomer && !isRider) {
    throw createCallError("You are not a participant in this call", 403, "FORBIDDEN");
  }
}

function assertValidTransition(currentStatus, nextStatus) {
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.has(nextStatus)) {
    throw createCallError(
      `Cannot transition call from '${currentStatus}' to '${nextStatus}'`,
      409,
      "INVALID_STATE_TRANSITION"
    );
  }
}

async function markSessionTerminal(session, nextStatus, reason, endedByRole) {
  clearAllCallTimers(session.id);

  if (TERMINAL_CALL_STATES.includes(session.status)) {
    return session;
  }

  const now = new Date();
  const durationSeconds = session.connectedAt
    ? Math.max(0, Math.round((now.getTime() - session.connectedAt.getTime()) / 1000))
    : 0;

  const updated = await prisma.callSession.update({
    where: { id: session.id },
    data: {
      status: nextStatus,
      endReason: reason || nextStatus,
      endedByRole: endedByRole || "system",
      endedAt: now,
      durationSeconds,
    },
  });

  const socketEvent =
    nextStatus === CALL_STATES.REJECTED
      ? "call:rejected"
      : nextStatus === CALL_STATES.MISSED
        ? "call:missed"
        : nextStatus === CALL_STATES.CANCELLED
          ? "call:cancelled"
          : nextStatus === CALL_STATES.FAILED
            ? "call:failed"
            : "call:ended";

  await Promise.allSettled([
    emitToSessionParticipant(
      updated,
      "customer",
      socketEvent,
      serializeCallSession(updated, "customer")
    ),
    emitToSessionParticipant(
      updated,
      "rider",
      socketEvent,
      serializeCallSession(updated, "rider")
    ),
    sendDismissPushToBoth(
      updated,
      nextStatus === CALL_STATES.CANCELLED || nextStatus === CALL_STATES.MISSED
        ? "call_cancelled"
        : "call_ended"
    ),
  ]);

  return updated;
}

export async function acceptCall({ actor, callId }) {
  const session = await prisma.callSession.findUnique({ where: { id: callId } });
  assertActorBelongsToSession(session, actor);

  if (actor.role !== session.calleeRole) {
    throw createCallError("Only the call recipient can accept this call", 403, "FORBIDDEN");
  }

  if (session.status === CALL_STATES.CONNECTING || session.status === CALL_STATES.CONNECTED) {
    return serializeCallSession(session, actor.role);
  }

  if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
    await markSessionTerminal(session, CALL_STATES.MISSED, "expired", "system");
    throw createCallError("This call has already expired", 410, "CALL_EXPIRED");
  }

  assertValidTransition(session.status, CALL_STATES.CONNECTING);

  // Re-verify order & rider assignment are still eligible before connecting!
  await resolveAuthorizedDeliveryContext({
    actor,
    deliveryId: session.externalDeliveryId,
    vendorOrderId: session.vendorOrderId,
  });

  const now = new Date();
  const updated = await prisma.callSession.update({
    where: { id: session.id },
    data: {
      status: CALL_STATES.CONNECTING,
      acceptedAt: now,
    },
  });

  scheduleCallTimeout(
    updated.id,
    CONNECT_TIMEOUT_MS,
    CALL_STATES.CONNECTING,
    async (stale) => {
      await markSessionTerminal(stale, CALL_STATES.FAILED, "connection_timeout", "system");
    }
  );

  await Promise.allSettled([
    emitToSessionParticipant(
      updated,
      "customer",
      "call:accepted",
      serializeCallSession(updated, "customer")
    ),
    emitToSessionParticipant(
      updated,
      "rider",
      "call:accepted",
      serializeCallSession(updated, "rider")
    ),
    sendDismissPushToBoth(updated, "call_answered"),
  ]);

  return serializeCallSession(updated, actor.role);
}

export async function rejectCall({ actor, callId, reason = "rejected_by_callee" }) {
  const session = await prisma.callSession.findUnique({ where: { id: callId } });
  assertActorBelongsToSession(session, actor);

  if (TERMINAL_CALL_STATES.includes(session.status)) {
    return serializeCallSession(session, actor.role);
  }

  if (actor.role === session.callerRole && session.status === CALL_STATES.RINGING) {
    const cancelled = await markSessionTerminal(
      session,
      CALL_STATES.CANCELLED,
      "cancelled_by_caller",
      actor.role
    );
    return serializeCallSession(cancelled, actor.role);
  }

  assertValidTransition(session.status, CALL_STATES.REJECTED);
  const rejected = await markSessionTerminal(
    session,
    CALL_STATES.REJECTED,
    reason,
    actor.role
  );
  return serializeCallSession(rejected, actor.role);
}

export async function markCallConnected({ actor, callId }) {
  const session = await prisma.callSession.findUnique({ where: { id: callId } });
  assertActorBelongsToSession(session, actor);

  if (session.status === CALL_STATES.CONNECTED) {
    return serializeCallSession(session, actor.role);
  }

  assertValidTransition(session.status, CALL_STATES.CONNECTED);
  const now = new Date();
  const updated = await prisma.callSession.update({
    where: { id: session.id },
    data: {
      status: CALL_STATES.CONNECTED,
      connectedAt: now,
    },
  });

  scheduleCallTimeout(
    updated.id,
    MAX_CALL_DURATION_MS,
    CALL_STATES.CONNECTED,
    async (longCall) => {
      await markSessionTerminal(longCall, CALL_STATES.ENDED, "max_duration_reached", "system");
    }
  );

  await Promise.allSettled([
    emitToSessionParticipant(
      updated,
      "customer",
      "call:connected",
      serializeCallSession(updated, "customer")
    ),
    emitToSessionParticipant(
      updated,
      "rider",
      "call:connected",
      serializeCallSession(updated, "rider")
    ),
  ]);

  return serializeCallSession(updated, actor.role);
}

export async function endCall({ actor, callId, reason = "ended_by_user" }) {
  const session = await prisma.callSession.findUnique({ where: { id: callId } });
  assertActorBelongsToSession(session, actor);

  if (TERMINAL_CALL_STATES.includes(session.status)) {
    return serializeCallSession(session, actor.role);
  }

  const nextStatus =
    session.status === CALL_STATES.RINGING && actor.role === session.callerRole
      ? CALL_STATES.CANCELLED
      : CALL_STATES.ENDED;

  const updated = await markSessionTerminal(session, nextStatus, reason, actor.role);
  return serializeCallSession(updated, actor.role);
}

export async function failCall({ actor, callId, reason = "webrtc_failed" }) {
  const session = await prisma.callSession.findUnique({ where: { id: callId } });
  assertActorBelongsToSession(session, actor);

  if (TERMINAL_CALL_STATES.includes(session.status)) {
    return serializeCallSession(session, actor.role);
  }

  const updated = await markSessionTerminal(session, CALL_STATES.FAILED, reason, actor.role);
  return serializeCallSession(updated, actor.role);
}

export async function verifySignalingAccess(actor, callId) {
  const session = await prisma.callSession.findUnique({ where: { id: callId } });
  assertActorBelongsToSession(session, actor);
  if (!ACTIVE_CALL_STATES.includes(session.status)) {
    throw createCallError("Call session is no longer active", 409, "CALL_NOT_ACTIVE");
  }
  const peerRole = actor.role === "customer" ? "rider" : "customer";
  return { session, peerRole };
}

export async function getCallForActor(actor, callId) {
  if (!callId || !UUID_REGEX.test(String(callId).trim())) {
    throw createCallError("Invalid call session ID", 400, "INVALID_CALL_ID");
  }
  const session = await prisma.callSession.findUnique({
    where: { id: String(callId).trim() },
  });
  assertActorBelongsToSession(session, actor);
  return serializeCallSession(session, actor.role);
}

export async function getActiveCallForActor(actor) {
  const where =
    actor.role === "customer"
      ? { customerId: actor.actorId, status: { in: ACTIVE_CALL_STATES } }
      : { riderId: actor.actorId, status: { in: ACTIVE_CALL_STATES } };

  const session = await prisma.callSession.findFirst({
    where,
    orderBy: { createdAt: "desc" },
  });

  if (!session) return null;

  if (
    session.status === CALL_STATES.RINGING &&
    session.expiresAt &&
    session.expiresAt.getTime() <= Date.now()
  ) {
    await markSessionTerminal(session, CALL_STATES.MISSED, "expired", "system");
    return null;
  }

  return serializeCallSession(session, actor.role);
}

/**
 * Terminates all active calls associated with an order or delivery when
 * the order is delivered, cancelled, failed, or the rider is reassigned.
 */
export async function terminateActiveCallsForOrder({
  orderId,
  vendorOrderId,
  externalDeliveryId,
  reason = "order_status_changed",
}) {
  const orConditions = [];
  if (orderId && UUID_REGEX.test(String(orderId))) {
    orConditions.push({ orderId: String(orderId) });
  }
  if (vendorOrderId && UUID_REGEX.test(String(vendorOrderId))) {
    orConditions.push({ vendorOrderId: String(vendorOrderId) });
  }
  if (externalDeliveryId && UUID_REGEX.test(String(externalDeliveryId))) {
    orConditions.push({ externalDeliveryId: String(externalDeliveryId) });
  }
  if (orConditions.length === 0) return 0;

  try {
    const activeSessions = await prisma.callSession.findMany({
      where: {
        status: { in: ACTIVE_CALL_STATES },
        OR: orConditions,
      },
    });

    for (const session of activeSessions) {
      await markSessionTerminal(session, CALL_STATES.ENDED, reason, "system");
    }
    return activeSessions.length;
  } catch (err) {
    console.warn("[CALL] terminateActiveCallsForOrder error:", err.message);
    return 0;
  }
}

/**
 * Handles socket disconnect for a participant with a grace period for network drops.
 */
export async function scheduleDisconnectTermination(actor) {
  const active = await getActiveCallForActor(actor);
  if (!active) return;

  const key = `${active.callId}:${actor.role}`;
  clearDisconnectGrace(active.callId, actor.role);

  const timer = setTimeout(async () => {
    disconnectTimers.delete(key);
    try {
      const fresh = await prisma.callSession.findUnique({
        where: { id: active.callId },
      });
      if (!fresh || !ACTIVE_CALL_STATES.includes(fresh.status)) return;
      await markSessionTerminal(
        fresh,
        CALL_STATES.FAILED,
        `${actor.role}_disconnected`,
        "system"
      );
    } catch (err) {
      console.warn("[CALL] Disconnect grace termination error:", err.message);
    }
  }, DISCONNECT_GRACE_MS);

  if (typeof timer.unref === "function") timer.unref();
  disconnectTimers.set(key, timer);
}
