import { verifySourcePickupCode } from "../../services/logistics/pickupCode.service.js";
import crypto from "crypto";
import prisma from "../../config/prisma.js";
import { processSamkaCallback } from "../../services/logistics/samkaLogistics.service.js";
import { sendDeliveryOTP, verifyDeliveryOTP } from "../../services/otp.service.js";
import { emitDeliveryLocationUpdate, emitOrderStatusUpdate } from "../../socket/events/orderEvents.js";

const rawBody = (req) => Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});

const validSignature = (req, raw) => {
  const timestamp = String(req.get("X-Logistics-Timestamp") || "");
  const signature = String(req.get("X-Logistics-Signature") || "").toLowerCase();
  const secret = String(process.env.SAMKA_LOGISTICS_CALLBACK_SIGNING_SECRET || "");
  const seconds = Number(timestamp);
  if (!secret || !signature || !Number.isFinite(seconds) || Math.abs(Date.now() - seconds * 1000) > 5 * 60_000) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(signature, "utf8");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const parseSignedBody = (req, res) => {
  const raw = rawBody(req);
  if (!validSignature(req, raw)) {
    res.status(401).json({ success: false, message: "Invalid logistics signature" });
    return null;
  }
  try { return { raw, body: JSON.parse(raw) }; }
  catch { res.status(400).json({ success: false, message: "Invalid JSON payload" }); return null; }
};

export const receiveSamkaCallback = async (req, res) => {
  const signed = parseSignedBody(req, res);
  if (!signed) return;
  const callback = signed.body;
  const eventId = String(callback.eventId || "");
  const eventType = String(callback.eventType || "");
  if (!eventId || !eventType) return res.status(400).json({ success: false, message: "eventId and eventType are required" });

  try {
    await prisma.logisticsCallbackEvent.create({ data: {
      eventId,
      eventType,
      externalDeliveryId: callback.deliveryId || null,
      sourceOrderId: callback.sourceOrderId ? String(callback.sourceOrderId) : null,
      payload: callback,
    } });
  } catch (error) {
    if (error?.code === "P2002") return res.status(204).end();
    throw error;
  }

  try {
    const result = await processSamkaCallback({ eventType, externalDeliveryId: callback.deliveryId, sourceOrderId: callback.sourceOrderId, data: callback.data || {}, payload: callback });
    const order = result.delivery?.vendorOrder?.userOrder;
    if (order && result.riderLocation) emitDeliveryLocationUpdate(order.orderCode, order.userId, result.riderLocation);
    if (order && result.statusChanged) emitOrderStatusUpdate({ orderId: order.orderCode, userId: order.userId, orderStatus: result.status, rider: callback.data?.rider || callback.data || null }, order.orderStatus);
    return res.status(204).end();
  } catch (error) {
    await prisma.logisticsCallbackEvent.delete({ where: { eventId } }).catch(() => null);
    return res.status(422).json({ success: false, message: error.message });
  }
};

const loadSourceOrder = async (sourceOrderId) => {
  const delivery = await prisma.logisticsDelivery.findFirst({
    where: { sourceOrderId: String(sourceOrderId || "") },
    include: { vendorOrder: { include: { userOrder: { include: { user: true, vendorOrders: true } } } } },
  });
  return delivery?.vendorOrder?.userOrder ? { delivery, vendorOrder: delivery.vendorOrder, order: delivery.vendorOrder.userOrder } : null;
};

const orderOtpId = (order) => String(order.legacyMongoId || order.id);

export const requestSamkaDeliveryCode = async (req, res) => {
  const signed = parseSignedBody(req, res);
  if (!signed) return;
  const sourceOrderId = String(signed.body.sourceOrderId || "").trim();
  if (!sourceOrderId) return res.status(400).json({ success: false, message: "sourceOrderId is required" });
  const context = await loadSourceOrder(sourceOrderId);
  if (!context) return res.status(404).json({ success: false, message: "Source delivery was not found" });
  const { order } = context;
  const phone = order.deliveryAddress?.phone || order.phone || order.user?.phone || null;
  const email = order.user?.email || null;
  if (!email) return res.status(422).json({ success: false, message: "Customer email is required to send the delivery code" });
  try {
    await sendDeliveryOTP(orderOtpId(order), phone, order.userId, { customerEmail: email, readableOrderId: order.orderCode || order.id });
    return res.status(204).end();
  } catch (error) {
    return res.status(503).json({ success: false, message: error.message || "Unable to send delivery code" });
  }
};

export const validateSamkaDeliveryCode = async (req, res) => {
  const signed = parseSignedBody(req, res);
  if (!signed) return;
  const sourceOrderId = String(signed.body.sourceOrderId || "").trim();
  const deliveryCode = String(signed.body.deliveryCode || "").trim();
  if (!sourceOrderId || !(deliveryCode.length === 6 && /^[0-9]+$/.test(deliveryCode))) return res.status(400).json({ success: false, message: "sourceOrderId and a 6-digit deliveryCode are required" });
  const context = await loadSourceOrder(sourceOrderId);
  if (!context) return res.status(404).json({ success: false, message: "Source delivery was not found" });
  const { order, vendorOrder } = context;
  try {
    const otherOrders = (order.vendorOrders || []).filter((item) => item.id !== vendorOrder.id);
    const terminal = new Set(["delivered", "completed", "cancelled", "failed"]);
    const consume = otherOrders.every((item) => terminal.has(String(item.orderStatus || "").toLowerCase()));
    const result = await verifyDeliveryOTP(orderOtpId(order), deliveryCode, { consume });
    if (!result.verified) return res.status(422).json({ success: false, message: "Incorrect delivery code" });
    return res.status(204).end();
  } catch (error) {
    return res.status(422).json({ success: false, message: error.message || "Delivery code is invalid or expired" });
  }
};


export const validateSamkaPickupCode = async (req, res, next) => {
  const signed = parseSignedBody(req, res);
  if (!signed) return;
  try {
    await verifySourcePickupCode(String(signed.body.sourceOrderId || "").trim(), String(signed.body.pickupCode || "").trim());
    return res.status(204).end();
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
    return next(error);
  }
};