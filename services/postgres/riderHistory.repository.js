import prisma from "../../config/prisma.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const legacyId = (row) => row?.legacyMongoId || row?.id || null;
const resolveRider = async (token) => {
  if (!token) return null;
  const value = String(token);
  return prisma.rider.findFirst({ where: { OR: [...(uuidPattern.test(value) ? [{ id: value }] : []), { legacyMongoId: value }] } });
};
const coords = (value) => value?.coordinates?.length === 2 ? { lat: value.coordinates[1], lng: value.coordinates[0] } : value;
const distance = (a, b) => {
  const one = coords(a), two = coords(b);
  const lat1 = Number(one?.lat ?? one?.latitude), lon1 = Number(one?.lng ?? one?.longitude), lat2 = Number(two?.lat ?? two?.latitude), lon2 = Number(two?.lng ?? two?.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 2.4;
  const rad = (n) => n * Math.PI / 180;
  const h = Math.sin(rad(lat2-lat1)/2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2-lon1)/2) ** 2;
  return Number((6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h))).toFixed(2));
};
const duration = (order) => {
  const log = Array.isArray(order.statusLog) ? order.statusLog : [];
  const start = log.find((entry) => ["out_for_delivery", "picked_up", "preparing"].includes(entry.status))?.timestamp || order.riderAssignment?.acceptedAt || order.riderAssignment?.assignedAt || order.createdAt;
  const end = log.find((entry) => ["delivered", "completed"].includes(entry.status))?.timestamp || order.updatedAt;
  return start && end && new Date(end) > new Date(start) ? Math.max(1, Math.round((new Date(end)-new Date(start))/60000)) : 14;
};
const address = (value) => typeof value === "string" ? value : [value?.addressLine || value?.street || value?.address, value?.cityName || value?.city, value?.stateName || value?.state, value?.postalCode].filter(Boolean).join(", ") || "Address unavailable";
const riderShape = (rider) => rider ? { ...rider, _id: legacyId(rider), id: legacyId(rider), password: undefined, otp: undefined, resetPasswordToken: undefined, isSuspended: Boolean(rider.metadata?.isSuspended), suspendedUntil: rider.metadata?.suspendedUntil || null } : { _id: "all", name: "All Fleet Personnel" };

export const riderHistoryRepository = {
  async get(riderToken, filters = {}) {
    const all = !riderToken || ["all", "overview"].includes(String(riderToken));
    const rider = all ? null : await resolveRider(riderToken);
    if (!all && !rider) return null;
    const createdAt = filters.startDate || filters.endDate ? { ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}), ...(filters.endDate ? { lte: new Date(filters.endDate) } : {}) } : null;
    const orders = await prisma.order.findMany({ where: { ...(rider ? { riderId: rider.id } : { riderId: { not: null } }), ...(createdAt ? { createdAt } : {}) }, include: { rider: true, items: { include: { restaurant: { select: { id: true, legacyMongoId: true, storeName: true, address: true, metadata: true } } } } }, orderBy: { createdAt: "desc" }, take: 200 });
    const deliveries = orders.map((order) => {
      const vendor = order.items[0]?.restaurant, deliveryAddress = order.deliveryAddress || {}, log = Array.isArray(order.statusLog) ? order.statusLog : [];
      return { _id: legacyId(order), orderId: order.orderCode, orderStatus: order.orderStatus, distanceKm: distance(vendor?.metadata?.location || vendor?.address?.coordinates, deliveryAddress.coordinates || deliveryAddress), durationMins: duration(order), earningsNaira: Number(order.riderEarnings ?? order.deliveryFee ?? 60000)/100, customer: { name: deliveryAddress.name || order.phone || "Customer", phone: order.phone || "N/A", address: address(deliveryAddress), city: deliveryAddress.cityName || deliveryAddress.city || "" }, vendor: { id: legacyId(vendor), storeName: vendor?.storeName || order.items[0]?.storeName || "Restaurant Vendor", address: address(vendor?.address) }, rider: { id: legacyId(order.rider), name: order.rider?.name || "Unassigned Rider", phone: order.rider?.phone || "N/A", vehicleType: order.rider?.vehicleType || "motorbike" }, timestamps: { created: order.createdAt, assigned: log.find((entry)=>entry.status==="rider_assigned")?.timestamp || order.riderAssignment?.assignedAt || order.createdAt, pickedUp: log.find((entry)=>["out_for_delivery","picked_up"].includes(entry.status))?.timestamp || order.riderAssignment?.acceptedAt || null, delivered: log.find((entry)=>["delivered","completed"].includes(entry.status))?.timestamp || order.updatedAt } };
    });
    const completed = deliveries.filter((row) => ["delivered","completed"].includes(row.orderStatus));
    const wallets = await prisma.wallet.findMany({ where: { ownerModel: "Rider", ...(rider ? { ownerId: rider.id } : {}) }, select: { id: true, ownerId: true } });
    const walletOwners = Object.fromEntries(wallets.map((wallet)=>[wallet.id,wallet.ownerId]));
    const ledger = wallets.length ? await prisma.walletTransaction.findMany({ where: { walletId: { in: wallets.map((wallet)=>wallet.id) } }, orderBy: { date: "desc" }, take: 500 }) : [];
    const config = await prisma.platformConfig.findUnique({ where: { type: "singleton" }, select: { value: true } });
    const payoutHour = Number(config?.value?.riderPayoutHour ?? 10), now = new Date(), today = new Date(now); today.setHours(0,0,0,0);
    const cutoff = new Date(today); cutoff.setHours(payoutHour,0,0,0); const nextPayout = new Date(cutoff); if(now>=cutoff)nextPayout.setDate(nextPayout.getDate()+1);
    const earningsLedger = ledger.filter((tx)=>tx.transactionType==="rider_payout"&&tx.date>=today&&tx.date<=now), before=earningsLedger.filter((tx)=>tx.date<cutoff), after=earningsLedger.filter((tx)=>tx.date>=cutoff);
    const sum = (rows) => rows.reduce((total,tx)=>total+Number(tx.amount||0),0)/100, rides=(rows)=>new Set(rows.map((tx)=>tx.orderId).filter(Boolean)).size;
    const totalDistance = Number(completed.reduce((total,row)=>total+row.distanceKm,0).toFixed(2)), totalDuration=completed.reduce((total,row)=>total+row.durationMins,0);
    return { rider: riderShape(rider), payoutHour, payoutCutoff: cutoff, nextPayout, analytics: { totalOrders: deliveries.length, completedOrders: completed.length, totalDistanceKm: totalDistance, avgDistanceKm: completed.length?Number((totalDistance/completed.length).toFixed(2)):0, avgDurationMins: completed.length?Math.round(totalDuration/completed.length):0, fastestDeliveryMins: completed.length?Math.min(...completed.map((row)=>row.durationMins)):0, slowestDeliveryMins: completed.length?Math.max(...completed.map((row)=>row.durationMins)):0, completionRatePct: deliveries.length?Math.round(completed.length/deliveries.length*100):100, totalEarningsNaira: completed.reduce((total,row)=>total+row.earningsNaira,0) }, deliveries, earnings: { totalToday: sum(earningsLedger), beforePayout: sum(before), afterPayout: sum(after) }, rides: { today: rides(earningsLedger), beforePayout: rides(before), afterPayout: rides(after) }, transactions: ledger.map((tx)=>({ ...tx, amount:Number(tx.amount)/100, reportingAmount:tx.reportingAmount==null?null:Number(tx.reportingAmount)/100, riderId:walletOwners[tx.walletId] })) };
  },
};
