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
