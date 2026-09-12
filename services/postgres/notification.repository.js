import prisma from "../../config/prisma.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const resolve = async (model, value) => {
  if (!value) return null;
  if (uuid.test(String(value))) return String(value);
  return (await model.findUnique({ where: { legacyMongoId: String(value) }, select: { id: true } }))?.id || null;
};
const shape = row => row ? ({ ...row, _id: row.legacyMongoId || row.id, vendorId: row.restaurantId }) : null;
const actor = role => role === "rider" ? [prisma.rider,"riderId"] : role === "vendor" ? [prisma.vendor,"restaurantId"] : role === "admin" ? [prisma.admin,"adminId"] : [prisma.user,"userId"];
const actorWhere = (role, id) => role === "admin" ? { OR: [{ role: "admin" }, { adminId: id }] } : { [actor(role)[1]]: id };

export const notificationRepository = {
  async create(data) {
    const [userId, riderId, adminId, restaurantId] = await Promise.all([
      resolve(prisma.user, data.userId), resolve(prisma.rider, data.riderId),
      resolve(prisma.admin, data.adminId), resolve(prisma.vendor, data.vendorId || data.restaurantId),
    ]);
    const role = ["user", "vendor", "rider", "admin"].includes(data.role) ? data.role : "user";
    const allowedTypes = ["order_placed","order_confirmed","order_preparing","order_ready","order_dispatched","order_delivered","order_cancelled","order_assigned","rider_order_rejected","vendor_new_order","vendor_order_cancelled","vendor_rider_assigned","admin_order_ready","admin_order_delivered","rider_assignment_needed","rider_assignment_accepted","rider_assignment_timeout","vendor_review","support_ticket","system","promo","discount","delivery_nearby","account_update","general"];
    const typeAliases = {
      delivery_confirmation_code: "account_update",
      rider_payout_credited: "account_update",
      vendor_order_delivered: "account_update",
      vendor_order_timeout: "vendor_order_cancelled",
      vendor_rider_offer: "vendor_rider_assigned",
      admin_insufficient_funds: "system",
      admin_new_vendor: "account_update",
      support_update: "support_ticket",
    };
    const requestedType = typeAliases[data.type] || data.type;
    const type = allowedTypes.includes(requestedType) ? requestedType : "general";
    const row = await prisma.notification.create({ data: { userId, riderId, adminId, restaurantId, role, type, title: data.title || "MelaChow", body: data.body || "", orderId: data.orderId ? String(data.orderId) : null, url: data.url || null, image: data.image || null, icon: data.icon || null, read: Boolean(data.read), data: data.data || {} } });
    return shape(row);
  },
  async unreadCount(role, tokenId) {
    const mapping = actor(role);
    const id = await resolve(mapping[0], tokenId);
    return id ? prisma.notification.count({ where: { ...actorWhere(role,id), read: false } }) : 0;
  },
  async list(role, tokenId, { limit = 100, skip = 0, unread, type, restaurantId } = {}) {
    const mapping = actor(role);
    const id = await resolve(mapping[0], tokenId);
    if (!id) return { notifications: [], total: 0 };
    const where = actorWhere(role,id);
    if (restaurantId && role === "user") {
      const vendorId = await resolve(prisma.vendor, restaurantId);
      where.OR = [{ userId: id }, ...(vendorId ? [{ restaurantId: vendorId }] : [])];
      delete where.userId;
    }
    if (unread === "true") where.read = false;
    if (type && type !== "all") where.type = type === "orders" ? { in: ["order_placed","order_confirmed","order_preparing","order_ready","order_dispatched","order_delivered","order_cancelled","order_assigned"] } : type === "promos" ? { in: ["promo", "discount"] } : type;
    const take = Math.min(Math.max(Number(limit) || 100, 1), 200), offset = Math.max(Number(skip) || 0, 0);
    const [rows, total] = await Promise.all([prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take, skip: offset }), prisma.notification.count({ where })]);
    return { notifications: rows.map(shape), total };
  },
  async markRead(role, tokenId, notificationId) {
    const mapping = actor(role);
    const [ownerId, id] = await Promise.all([resolve(mapping[0], tokenId), resolve(prisma.notification, notificationId)]);
    if (!ownerId || !id) return null;
    const changed = await prisma.notification.updateMany({ where: { id, ...actorWhere(role,ownerId) }, data: { read: true } });
    return changed.count ? shape(await prisma.notification.findUnique({ where: { id } })) : null;
  },
  async markAllRead(role, tokenId) {
    const mapping = actor(role);
    const id = await resolve(mapping[0], tokenId);
    return id ? (await prisma.notification.updateMany({ where: { ...actorWhere(role,id), read: false }, data: { read: true } })).count : 0;
  },
  async remove(role, tokenId, notificationId = null) {
    const mapping = actor(role);
    const ownerId = await resolve(mapping[0], tokenId);
    if (!ownerId) return 0;
    const where = actorWhere(role,ownerId);
    if (notificationId) { const id = await resolve(prisma.notification, notificationId); if (!id) return 0; where.id = id; }
    return (await prisma.notification.deleteMany({ where })).count;
  },
  async saveSubscription(role, tokenId, subscription, deviceType = "web", userAgent = "") { const mapping=actor(role),ownerId=await resolve(mapping[0],tokenId);if(!ownerId)throw new Error(`${role} not found`);const ownerModel=role==="vendor"?"Vendor":role==="rider"?"Rider":role==="admin"?"Admin":"User";return prisma.pushSubscription.upsert({where:{endpoint:subscription.endpoint},create:{ownerId,ownerModel,endpoint:subscription.endpoint,subscription:{...subscription,deviceType,userAgent}},update:{ownerId,ownerModel,subscription:{...subscription,deviceType,userAgent}}}); },
  async removeSubscription(role, tokenId, endpoint) { const mapping=actor(role),ownerId=await resolve(mapping[0],tokenId);if(!ownerId)return 0;const ownerModel=role==="vendor"?"Vendor":role==="rider"?"Rider":role==="admin"?"Admin":"User";return (await prisma.pushSubscription.deleteMany({where:{ownerId,ownerModel,endpoint}})).count; },
  async listSubscriptions(role, tokenId = null) {
    const ownerModel = role === "vendor" ? "Vendor" : role === "rider" ? "Rider" : role === "admin" ? "Admin" : "User";
    let ownerId;
    if (tokenId) {
      const mapping = actor(role);
      ownerId = await resolve(mapping[0], tokenId);
      if (!ownerId) return [];
    }
    const rows = await prisma.pushSubscription.findMany({ where: { ownerModel, ...(ownerId ? { ownerId } : {}) } });
    return rows.map((row) => ({
      _id: row.id,
      id: row.id,
      endpoint: row.endpoint,
      subscription: row.subscription,
      deviceType: row.subscription?.deviceType || "web",
    }));
  },
  async removeSubscriptionById(id) {
    if (!id || !uuid.test(String(id))) return 0;
    return (await prisma.pushSubscription.deleteMany({ where: { id: String(id) } })).count;
  },
  async getVendorProfile(tokenId) {
    const id = await resolve(prisma.vendor, tokenId);
    if (!id) return null;
    return prisma.vendor.findUnique({
      where: { id },
      select: { id: true, legacyMongoId: true, email: true, phone: true, storeName: true, ownerIds: true },
    });
  },
  async resolveVendorOrderId(vendorToken, orderToken) {
    const vendorId = await resolve(prisma.vendor, vendorToken);
    if (!vendorId || !orderToken) return null;
    const token = String(orderToken);
    const vendorOrder = await prisma.vendorOrder.findFirst({
      where: {
        restaurantId: vendorId,
        OR: [
          ...(uuid.test(token) ? [{ id: token }, { userOrderId: token }] : []),
          { legacyMongoId: token },
          { userOrder: { is: { OR: [{ legacyMongoId: token }, { orderCode: token }] } } },
        ],
      },
      select: { id: true, legacyMongoId: true },
    });
    return vendorOrder?.legacyMongoId || vendorOrder?.id || null;
  },
};
