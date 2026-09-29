import prisma from "../../config/prisma.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const legacyId = (row) => row?.legacyMongoId || row?.id || null;
const resolve = async (model, token) => {
  if (!token) return null;
  const value = String(token);
  const row = await model.findFirst({ where: { OR: [...(uuidPattern.test(value) ? [{ id: value }] : []), { legacyMongoId: value }] }, select: { id: true } });
  return row?.id || null;
};

export const disputeRepository = {
  async respondToRemake(vendorOrderToken, vendorToken, decision) {
    const [vendorOrderId, vendorId] = await Promise.all([resolve(prisma.vendorOrder, vendorOrderToken), resolve(prisma.vendor, vendorToken)]);
    if (!vendorOrderId || !vendorId) return { success: false, status: 404, message: "Vendor order not found." };
    const vendorOrder = await prisma.vendorOrder.findFirst({ where: { id: vendorOrderId, restaurantId: vendorId }, include: { userOrder: true } });
    if (!vendorOrder) return { success: false, status: 404, message: "Vendor order not found." };
    if (!vendorOrder.userOrder) return { success: false, status: 404, message: "Master order not found." };
    if (vendorOrder.userOrder.orderStatus !== "disputed_delivery") return { success: false, status: 409, message: "This order is no longer in a disputed state. The window may have expired." };
    const accepted = String(decision).toLowerCase() === "yes";
    const statusLog = Array.isArray(vendorOrder.userOrder.statusLog) ? vendorOrder.userOrder.statusLog : [];
    await prisma.$transaction(async (tx) => {
      if (accepted) {
        await tx.vendorOrder.updateMany({ where: { userOrderId: vendorOrder.userOrderId }, data: { orderStatus: "preparing" } });
        await tx.order.update({ where: { id: vendorOrder.userOrderId }, data: { orderStatus: "preparing", statusLog: [...statusLog, { status: "preparing", changedBy: `vendor:${vendorToken}`, timestamp: new Date().toISOString(), note: "Vendor agreed to remake after disputed delivery" }] } });
      }
      const pending = await tx.orderTermination.findFirst({ where: { orderId: vendorOrder.userOrderId, status: { in: ["pending", "disputed"] } }, orderBy: { terminatedAt: "desc" }, select: { id: true, metadata: true } });
      if (pending) await tx.orderTermination.update({ where: { id: pending.id }, data: { status: accepted ? "resolved" : "disputed", resolvedAt: accepted ? new Date() : null, metadata: { ...(pending.metadata || {}), vendorDecision: accepted ? "accepted" : "declined", vendorRespondedAt: new Date().toISOString() } } });
    });
    return { success: true, accepted, orderId: legacyId(vendorOrder.userOrder), orderDatabaseId: vendorOrder.userOrder.id, riderId: vendorOrder.userOrder.riderId, message: accepted ? "Great! Order reset to 'preparing'. A fresh batch is being prepared." : "Response recorded. Admin has been notified to resolve this order." };
  },

  async escalate(orderToken) {
    const orderId = await resolve(prisma.order, orderToken);
    if (!orderId) return { skipped: true, reason: "not_found" };
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.orderStatus !== "disputed_delivery") return { skipped: true, reason: "resolved" };
      const statusLog = Array.isArray(order.statusLog) ? order.statusLog : [];
      await tx.order.update({ where: { id: order.id }, data: { statusLog: [...statusLog, { status: "disputed_delivery", changedBy: "system:dispute_escalation", timestamp: new Date().toISOString() }] } });
      const termination = await tx.orderTermination.findFirst({ where: { orderId: order.id, status: { in: ["pending", "disputed"] } }, orderBy: { terminatedAt: "desc" }, select: { id: true, metadata: true } });
      if (termination) await tx.orderTermination.update({ where: { id: termination.id }, data: { status: "disputed", metadata: { ...(termination.metadata || {}), escalatedAt: new Date().toISOString(), escalatedBy: "system:dispute_escalation" } } });
      return { skipped: false, orderId: legacyId(order), orderDatabaseId: order.id };
    });
  },
};
