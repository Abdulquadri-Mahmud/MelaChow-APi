import crypto from "crypto";
import prisma from "../../config/prisma.js";

const TTL_MS = 30 * 60_000;
const MAX_ATTEMPTS = 5;
const readyStates = new Set(["ready_for_pickup", "rider_assigned"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const assertReady = (order) => {
  if (!order || order.restaurant?.deliveryManagedBy !== "admin") throw failure("Samka pickup is unavailable for this order.", 409);
  if (order.userOrder?.paymentStatus !== "paid" || !readyStates.has(order.orderStatus)) throw failure("The paid order must be ready for pickup before a pickup code can be used.", 409);
};

export async function issueVendorPickupCode(vendorOrderId, vendorId) {
  const where = uuid.test(String(vendorOrderId)) ? { id: String(vendorOrderId) } : { legacyMongoId: String(vendorOrderId) };
  return prisma.$transaction(async (tx) => {
    const order = await tx.vendorOrder.findUnique({ where, include: { restaurant: true, userOrder: true } });
    if (!order || ![order.restaurantId, order.restaurant?.legacyMongoId].includes(String(vendorId))) throw failure("Vendor order not found.", 404);
    await tx.$queryRaw`SELECT id FROM vendor_orders WHERE id = ${order.id}::uuid FOR UPDATE`;
    const current = await tx.vendorOrder.findUnique({ where: { id: order.id }, include: { restaurant: true, userOrder: true } });
    assertReady(current);
    const delivery = await tx.logisticsDelivery.findUnique({ where: { vendorOrderId: order.id } });
    if (!delivery || delivery.dispatchStatus === "terminal") throw failure("Samka delivery is not available for this order.", 409);
    const key = `samka_pickup:${order.id}`;
    const existing = await tx.deliveryOtpSession.findUnique({ where: { key } });
    if (existing && existing.expiresAt > new Date() && Number(existing.payload.attempts || 0) < MAX_ATTEMPTS) {
      return { pickupCode: existing.payload.pickupCode, expiresAt: existing.expiresAt };
    }
    const pickupCode = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    const expiresAt = new Date(Date.now() + TTL_MS);
    const data = { payload: { kind: "pickup", sourceOrderId: order.id, pickupCode, attempts: 0 }, expiresAt };
    await tx.deliveryOtpSession.upsert({ where: { key }, create: { key, ...data }, update: data });
    return { pickupCode, expiresAt };
  });
}

export async function verifySourcePickupCode(sourceOrderId, pickupCode) {
  if (!uuid.test(String(sourceOrderId)) || !/^\d{6}$/.test(String(pickupCode))) throw failure("sourceOrderId and a 6-digit pickupCode are required.", 400);
  const outcome = await prisma.$transaction(async (tx) => {
    const delivery = await tx.logisticsDelivery.findFirst({ where: { sourceOrderId: String(sourceOrderId) }, include: { vendorOrder: { include: { restaurant: true, userOrder: true } } } });
    if (!delivery || delivery.dispatchStatus === "terminal") return { message: "Source delivery was not found.", statusCode: 404 };
    assertReady(delivery.vendorOrder);
    const key = `samka_pickup:${delivery.vendorOrderId}`;
    await tx.$queryRaw`SELECT key FROM delivery_otp_sessions WHERE key = ${key} FOR UPDATE`;
    const session = await tx.deliveryOtpSession.findUnique({ where: { key } });
    if (!session || session.expiresAt <= new Date()) return { message: "Pickup code is missing or expired. Ask the store to show a new pickup code.", statusCode: 422 };
    if (session.payload.kind !== "pickup" || session.payload.sourceOrderId !== String(sourceOrderId)) return { message: "Pickup code belongs to another order.", statusCode: 422 };
    if (Number(session.payload.attempts || 0) >= MAX_ATTEMPTS) return { message: "Too many incorrect pickup codes. Ask the store to generate a new code.", statusCode: 429 };
    const expected = Buffer.from(String(session.payload.pickupCode));
    const supplied = Buffer.from(String(pickupCode));
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
      await tx.deliveryOtpSession.update({ where: { key }, data: { payload: { ...session.payload, attempts: Number(session.payload.attempts || 0) + 1 } } });
      return { message: "Incorrect pickup code. Check the code with the store.", statusCode: 422 };
    }
    // Do not consume here: Samka may need to retry if its own status save fails.
    return null;
  });
  if (outcome) throw failure(outcome.message, outcome.statusCode);
}