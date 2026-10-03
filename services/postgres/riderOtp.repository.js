import crypto from 'node:crypto';
import prisma from "../../config/prisma.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const legacyId = (record) => record?.legacyMongoId || record?.id || null;

const tokenWhere = (token) => ({
  OR: [
    ...(uuidPattern.test(String(token)) ? [{ id: String(token) }] : []),
    { legacyMongoId: String(token) },
  ],
});

export const getDeliveryOtpContext = async (orderToken, riderToken) => {
  const rider = await prisma.rider.findFirst({ where: tokenWhere(riderToken), select: { id: true } });
  if (!rider) return null;

  const vendorOrder = await prisma.vendorOrder.findFirst({
    where: tokenWhere(orderToken),
    include: {
      userOrder: { include: { user: { select: { id: true, legacyMongoId: true, phone: true, email: true } } } },
    },
  });
  const order = vendorOrder?.userOrder || await prisma.order.findFirst({
    where: tokenWhere(orderToken),
    include: { user: { select: { id: true, legacyMongoId: true, phone: true, email: true } } },
  });
  if (!order) return null;

  return {
    isAssigned: order.riderId === rider.id || vendorOrder?.riderId === rider.id,
    actualOrderId: legacyId(order),
    orderId: order.orderCode,
    orderStatus: vendorOrder?.orderStatus || order.orderStatus,
    customerPhone: order.deliveryAddress?.phone || order.phone || order.user?.phone || null,
    customerUserId: legacyId(order.user) || order.userId,
    customerEmail: order.user?.email || null,
  };
};

export const storeDeliveryOtpSession = (key, payload, expiresAt) =>
  prisma.deliveryOtpSession.upsert({
    where: { key },
    create: { key, payload, expiresAt },
    update: { payload, expiresAt },
  });

export const ensureDeliveryOtpSession = (key, makePayload) => prisma.$transaction(async (tx) => {
  // Serialize initial customer detail reads so parallel tabs cannot receive different codes.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key})) IS NULL AS acquired`;
  const existing = await tx.deliveryOtpSession.findUnique({ where: { key } });
  if (existing && existing.expiresAt > new Date() && Number(existing.payload?.attempts || 0) < 5)
    return { payload: existing.payload, expiresAt: existing.expiresAt };

  const payload = makePayload();
  const expiresAt = new Date(payload.expiresAt);
  await tx.deliveryOtpSession.upsert({
    where: { key },
    create: { key, payload, expiresAt },
    update: { payload, expiresAt },
  });
  return { payload, expiresAt };
});

export const verifyDeliveryOtpSession = (key, suppliedCode, { consume = false, maxAttempts = 5 } = {}) => prisma.$transaction(async (tx) => {
  // Serialize verification attempts in PostgreSQL; Redis remains a read cache only.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key})) IS NULL AS acquired`;
  const session = await tx.deliveryOtpSession.findUnique({ where: { key } });
  if (!session || session.expiresAt <= new Date()) {
    if (session) await tx.deliveryOtpSession.delete({ where: { key } });
    return { error: "expired" };
  }

  const payload = session.payload || {};
  const method = payload.method;
  if (method === "sms") return { error: "sms" };
  if (!["dev", "email", "tracking"].includes(method) || !payload.otp)
    return { error: "invalid" };

  const attempts = Number(payload.attempts || 0);
  if (attempts >= maxAttempts) return { error: "locked" };
  const expected = Buffer.from(method === "dev" ? "123456" : String(payload.otp));
  const supplied = Buffer.from(String(suppliedCode));
  const verified = expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
  if (!verified) {
    await tx.deliveryOtpSession.update({
      where: { key },
      data: { payload: { ...payload, attempts: attempts + 1 } },
    });
    return { verified: false, attemptsRemaining: Math.max(0, maxAttempts - attempts - 1) };
  }

  if (consume) await tx.deliveryOtpSession.delete({ where: { key } });
  return { verified: true };
});

export const getDeliveryOtpSession = async (key) => {
  const session = await prisma.deliveryOtpSession.findUnique({ where: { key } });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.deliveryOtpSession.delete({ where: { key } }).catch(() => null);
    return null;
  }
  return session.payload;
};

export const deleteDeliveryOtpSession = (key) =>
  prisma.deliveryOtpSession.deleteMany({ where: { key } });
