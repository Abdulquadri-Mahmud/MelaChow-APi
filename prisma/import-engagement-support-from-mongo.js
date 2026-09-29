import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

const stats = {};
const skipped = [];
const textId = (value) => (value ? String(value) : null);
const asDate = (value) => (value ? new Date(value) : undefined);
const cleanJson = (value, fallback) => value == null ? fallback : JSON.parse(JSON.stringify(value));
const mark = (name, source, imported) => { stats[name] = { source, imported }; };
const skip = (collection, id, reason) => skipped.push({ collection, id: textId(id), reason });

const mapByLegacy = async (model, extra = {}) => new Map(
  (await model.findMany({ select: { id: true, legacyMongoId: true, ...extra } }))
    .filter((row) => row.legacyMongoId)
    .map((row) => [row.legacyMongoId, row])
);
const resolve = (map, value) => map.get(textId(value))?.id || null;
const docs = async (db, name) => db.collection(name).find({}).sort({ createdAt: 1 }).toArray();
const upsert = (model, doc, data) => model.upsert({
  where: { legacyMongoId: textId(doc._id) },
  create: { legacyMongoId: textId(doc._id), ...data },
  update: data,
});
const runPool = async (items, worker, concurrency = 20) => {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
};

const allowedNotificationTypes = new Set([
  "order_placed", "order_confirmed", "order_preparing", "order_ready", "order_dispatched",
  "order_delivered", "order_cancelled", "order_assigned", "rider_order_rejected", "vendor_new_order",
  "vendor_order_cancelled", "vendor_rider_assigned", "admin_order_ready", "admin_order_delivered",
  "rider_assignment_needed", "rider_assignment_accepted", "rider_assignment_timeout", "vendor_review",
  "support_ticket", "system", "promo", "discount", "delivery_nearby", "account_update", "general",
]);
const notificationTypeAliases = {
  delivery_confirmation_code: "account_update",
  rider_payout_credited: "account_update",
  vendor_order_delivered: "account_update",
  vendor_order_timeout: "vendor_order_cancelled",
  vendor_rider_offer: "vendor_rider_assigned",
  admin_insufficient_funds: "system",
  admin_new_vendor: "account_update",
  support_update: "support_ticket",
  order_remake_request: "general",
  rider_terminated_reassigning: "general",
  rider_timeout_reassigning: "general",
  delivery_timed_out: "general",
  dispute_escalation_admin: "system",
};
const notificationType = (value) => {
  const mapped = notificationTypeAliases[value] || value;
  return allowedNotificationTypes.has(mapped) ? mapped : "general";
};

const main = async () => {
  if (!process.env.MONGO_URI || !process.env.DATABASE_URL) throw new Error("MONGO_URI and DATABASE_URL are required");
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const [users, vendors, riders, admins, orders, vendorOrders, cities, categories] = await Promise.all([
    mapByLegacy(prisma.user), mapByLegacy(prisma.vendor), mapByLegacy(prisma.rider), mapByLegacy(prisma.admin),
    mapByLegacy(prisma.order), mapByLegacy(prisma.vendorOrder), mapByLegacy(prisma.city, { name: true }),
    mapByLegacy(prisma.category),
  ]);
  const cityByName = new Map([...cities.values()].map((row) => [String(row.name || "").trim().toLowerCase(), row.id]));

  try {
    const banners = await docs(db, "banners");
    let imported = 0;
    for (const row of banners) {
      const createdById = resolve(admins, row.createdBy);
      if (!createdById) { skip("banners", row._id, "missing createdBy admin"); continue; }
      await upsert(prisma.banner, row, {
        title: row.title || "Banner", subtitle: row.subtitle || "", description: row.description || "",
        bannerType: row.bannerType || "announcement", contentStyle: row.contentStyle || "plain",
        imageUrl: row.imageUrl || "", mobileImageUrl: row.mobileImageUrl || "",
        backgroundGradient: cleanJson(row.backgroundGradient, {}), backgroundColor: row.backgroundColor || "",
        textColor: row.textColor || "", accentColor: row.accentColor || "", ctaText: row.ctaText || "",
        ctaLink: row.ctaLink || "", linkedRestaurantId: resolve(vendors, row.linkedRestaurantId),
        linkedCategoryId: resolve(categories, row.linkedCategoryId), icon: row.icon || "",
        isActive: row.isActive !== false, displayOrder: Number(row.displayOrder || 0),
        startDate: asDate(row.startDate) || null, endDate: asDate(row.endDate) || null, createdById,
        createdAt: asDate(row.createdAt), updatedAt: asDate(row.updatedAt),
      });
      imported++;
    }
    mark("banners", banners.length, imported);

    const terminations = await docs(db, "orderterminations");
    imported = 0;
    for (const row of terminations) {
      const orderId = resolve(orders, row.orderId), vendorOrderId = resolve(vendorOrders, row.vendorOrderId);
      const previousRiderId = resolve(riders, row.previousRiderId);
      if (!orderId || !vendorOrderId || !previousRiderId) {
        skip("orderterminations", row._id, "missing order, vendor order, or previous rider"); continue;
      }
      await upsert(prisma.orderTermination, row, {
        orderId, vendorOrderId, previousRiderId, previousRiderName: row.previousRiderName || "Legacy Rider",
        previousRiderPhone: row.previousRiderPhone || "", foodPickedUp: Boolean(row.foodPickedUp),
        reason: row.reason || "rider_initiated", riderNote: row.riderNote || "", status: row.status || "pending",
        newRiderId: resolve(riders, row.newRiderId), terminatedAt: asDate(row.terminatedAt) || new Date(),
        resolvedAt: asDate(row.resolvedAt) || null, metadata: {}, createdAt: asDate(row.createdAt), updatedAt: asDate(row.updatedAt),
      });
      imported++;
    }
    mark("orderTerminations", terminations.length, imported);

    const notifications = await docs(db, "notifications");
    imported = 0;
    await runPool(notifications, async (row) => {
      await upsert(prisma.notification, row, {
        userId: resolve(users, row.userId), riderId: resolve(riders, row.riderId), adminId: resolve(admins, row.adminId),
        restaurantId: resolve(vendors, row.restaurantId),
        role: ["user", "vendor", "admin", "rider"].includes(row.role) ? row.role : "user",
        title: row.title || "MelaChow", body: row.body || "", type: notificationType(row.type),
        orderId: row.orderId ? String(row.orderId) : null, url: row.url || null, image: row.image || null,
        icon: row.icon || null, read: Boolean(row.read), data: cleanJson(row.data, {}),
        createdAt: asDate(row.createdAt), updatedAt: asDate(row.updatedAt),
      });
      imported++;
    });
    mark("notifications", notifications.length, imported);

    const supportTickets = await docs(db, "supporttickets");
    imported = 0;
    for (const row of supportTickets) {
      const status = ["open", "pending", "escalated", "resolved", "closed"].includes(row.status) ? row.status : "open";
      await upsert(prisma.supportTicket, row, {
        ticketNumber: row.ticketNumber || `LEGACY-${row._id}`, userId: resolve(users, row.userId),
        orderId: resolve(orders, row.order), subject: row.subject || "Support request", message: row.message || "",
        category: row.category || "other", priority: row.priority || "normal", status,
        orderReference: row.orderReference || null, paymentReference: row.paymentReference || null,
        customerName: row.customerName || "", customerEmail: row.customerEmail || "", customerPhone: row.customerPhone || "",
        requestedResolution: row.requestedResolution || "", evidence: cleanJson(row.evidence, []),
        conversation: cleanJson(row.conversation, []), assignedAdminId: resolve(admins, row.assignedAdminId),
        assignedAdminName: row.assignedAdminName || "", firstResponseDueAt: asDate(row.firstResponseDueAt) || null,
        resolutionDueAt: asDate(row.resolutionDueAt) || null, firstRespondedAt: asDate(row.firstRespondedAt) || null,
        reopenedAt: asDate(row.reopenedAt) || null, lastCustomerActivityAt: asDate(row.lastCustomerActivityAt) || null,
        lastAdminActivityAt: asDate(row.lastAdminActivityAt) || null, resolvedAt: asDate(row.resolvedAt) || null,
        closedAt: asDate(row.closedAt) || null, adminNotes: cleanJson(row.adminNotes, []), timeline: cleanJson(row.timeline, []),
        metadata: {}, createdAt: asDate(row.createdAt), updatedAt: asDate(row.updatedAt),
      });
      imported++;
    }
    mark("supportTickets", supportTickets.length, imported);

    const trends = await docs(db, "searchtrends");
    imported = 0;
    await runPool(trends, async (row) => {
      await upsert(prisma.searchTrend, row, {
        keyword: String(row.keyword || "").trim().toLowerCase() || "unknown", count: Number(row.count || 1),
        userId: resolve(users, row.userId), vendorId: resolve(vendors, row.vendorId),
        cityId: resolve(cities, row.cityId) || cityByName.get(String(row.city || "").trim().toLowerCase()) || null,
        metadata: { state: row.state || null, city: row.city || null, lastSearchedAt: row.lastSearchedAt || null },
        createdAt: asDate(row.createdAt), updatedAt: asDate(row.updatedAt),
      });
      imported++;
    });
    mark("searchTrends", trends.length, imported);

    const vendorPromos = await docs(db, "vendordeliverypromos");
    imported = 0;
    for (const row of vendorPromos) {
      const vendorId = resolve(vendors, row.vendorId);
      if (!vendorId) { skip("vendordeliverypromos", row._id, "missing vendor"); continue; }
      await upsert(prisma.vendorDeliveryPromo, row, {
        vendorId, maxOrders: row.maxOrders == null ? null : Number(row.maxOrders), usedOrders: Number(row.usedOrders || 0),
        startsAt: asDate(row.startsAt) || null, endsAt: asDate(row.endsAt) || null, isActive: Boolean(row.isActive),
        metadata: { adminNote: row.adminNote || "" }, createdAt: asDate(row.createdAt), updatedAt: asDate(row.updatedAt),
      });
      imported++;
    }
    mark("vendorDeliveryPromos", vendorPromos.length, imported);

    const freePromos = await docs(db, "freedeliverypromos");
    imported = 0;
    for (const row of freePromos) {
      await upsert(prisma.freeDeliveryPromo, row, {
        maxOrders: row.maxOrders == null ? null : Number(row.maxOrders), usedOrders: Number(row.usedOrders || 0),
        startsAt: asDate(row.startsAt) || null, endsAt: asDate(row.endsAt) || null, isActive: row.isActive !== false,
        metadata: { name: row.name || "first_order_free_delivery" }, createdAt: asDate(row.createdAt), updatedAt: asDate(row.updatedAt),
      }); imported++;
    }
    mark("freeDeliveryPromos", freePromos.length, imported);

    const refreshedVendorPromos = await mapByLegacy(prisma.vendorDeliveryPromo);
    const refreshedFreePromos = await mapByLegacy(prisma.freeDeliveryPromo);
    const vendorClaims = await docs(db, "vendordeliveryclaims");
    imported = 0;
    for (const row of vendorClaims) {
      const promoId = resolve(refreshedVendorPromos, row.promoId), vendorId = resolve(vendors, row.vendorId);
      if (!promoId || !vendorId) { skip("vendordeliveryclaims", row._id, "missing promo or vendor"); continue; }
      await upsert(prisma.vendorDeliveryClaim, row, {
        promoId, vendorId, userId: resolve(users, row.userId), orderId: resolve(orders, row.orderId),
        hashedDeviceId: row.hashedDeviceId || null, phoneHash: row.phoneHash || null,
        metadata: { deliveryFeeWaived: row.deliveryFeeWaived || 0 }, createdAt: asDate(row.createdAt), updatedAt: asDate(row.updatedAt),
      }); imported++;
    }
    mark("vendorDeliveryClaims", vendorClaims.length, imported);

    const freeClaims = await docs(db, "freedeliveryclaims");
    imported = 0;
    for (const row of freeClaims) {
      const promoId = resolve(refreshedFreePromos, row.promoId);
      if (!promoId) { skip("freedeliveryclaims", row._id, "missing promo"); continue; }
      await upsert(prisma.freeDeliveryClaim, row, {
        promoId, userId: resolve(users, row.userId), orderId: resolve(orders, row.orderId), hashedIp: row.hashedIp || null,
        hashedDeviceId: row.hashedDeviceId || null, phoneHash: row.phoneHash || null,
        metadata: { deliveryFeeWaived: row.deliveryFeeWaived || 0 }, createdAt: asDate(row.createdAt), updatedAt: asDate(row.updatedAt),
      }); imported++;
    }
    mark("freeDeliveryClaims", freeClaims.length, imported);

    const subscriptionSources = [
      ["pushsubscriptions", "User", users, "userId"], ["vendorpushsubscriptions", "Vendor", vendors, "vendorId"],
      ["adminpushsubscriptions", "Admin", admins, "adminId"], ["riderpushsubscriptions", "Rider", riders, "riderId"],
    ];
    let subscriptionSourceCount = 0, subscriptionImported = 0;
    for (const [collection, ownerModel, ownerMap, ownerField] of subscriptionSources) {
      const rows = await docs(db, collection); subscriptionSourceCount += rows.length;
      for (const row of rows) {
        const ownerId = resolve(ownerMap, row[ownerField]), endpoint = row.subscription?.endpoint;
        if (!ownerId || !endpoint) { skip(collection, row._id, "missing owner or endpoint"); continue; }
        const subscription = { ...cleanJson(row.subscription, {}), deviceType: row.deviceType || "unknown", ...(row.userAgent ? { userAgent: row.userAgent } : {}) };
        await prisma.pushSubscription.upsert({
          where: { endpoint },
          create: { legacyMongoId: textId(row._id), ownerId, ownerModel, endpoint, subscription, createdAt: asDate(row.createdAt), updatedAt: asDate(row.updatedAt || row.lastUsed) },
          update: { legacyMongoId: textId(row._id), ownerId, ownerModel, subscription, updatedAt: asDate(row.updatedAt || row.lastUsed) },
        }); subscriptionImported++;
      }
    }
    mark("pushSubscriptions", subscriptionSourceCount, subscriptionImported);

    const reports = await docs(db, "reports");
    imported = 0;
    for (const row of reports) {
      const reporterId = resolve(users, row.reporterId || row.userId);
      if (!reporterId) { skip("reports", row._id, "missing reporter"); continue; }
      const targetMaps = { User: users, Vendor: vendors, Rider: riders, Admin: admins, Order: orders };
      const targetMap = targetMaps[row.targetModel];
      await upsert(prisma.report, row, {
        reporterId, targetId: targetMap ? resolve(targetMap, row.targetId) : null, targetModel: row.targetModel || null,
        reason: row.reason || null, status: ["pending", "reviewed", "resolved", "dismissed"].includes(row.status) ? row.status : "pending",
        metadata: cleanJson(row.metadata, {}), createdAt: asDate(row.createdAt), updatedAt: asDate(row.updatedAt),
      }); imported++;
    }
    mark("reports", reports.length, imported);

    console.log(JSON.stringify({ stats, skipped }, null, 2));
    if (skipped.length) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error("Engagement/support import failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});