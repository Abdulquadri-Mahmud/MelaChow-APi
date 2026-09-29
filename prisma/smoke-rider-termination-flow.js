import "dotenv/config";
import prisma from "../config/prisma.js";
import { riderSelfRepository } from "../services/postgres/riderSelf.repository.js";
import { disputeRepository } from "../services/postgres/dispute.repository.js";
import { riderAccountsRepository } from "../services/postgres/riderAccounts.repository.js";
import { riderHistoryRepository } from "../services/postgres/riderHistory.repository.js";
import { riderBroadcastRepository } from "../services/postgres/riderBroadcast.repository.js";

let riderId;
let replacementRiderId;
let orderId;
let stateId;
let cityId;
try {
  const [user, vendor] = await Promise.all([prisma.user.findFirst(), prisma.vendor.findFirst()]);
  if (!user || !vendor) throw new Error("User and vendor fixtures are required");
  const suffix = Date.now();
  const state = await prisma.state.create({ data: { name: `Broadcast Smoke State ${suffix}` } }); stateId = state.id;
  const city = await prisma.city.create({ data: { name: `Broadcast Smoke City ${suffix}`, stateId, platformDeliveryFee: 0 } }); cityId = city.id;
  const createdRider = await riderAccountsRepository.create({ name: "Termination Smoke Rider", phone: `smoke-${suffix}`, password: "smoke-password", vehicleType: "motorbike", isVerified: true, stateId, cityId, locationStatus: "approved" }, vendor.id);
  riderId = (await prisma.rider.findFirst({ where: { phone: `smoke-${suffix}` } })).id;
  const rider = await prisma.rider.findUnique({ where: { id: riderId } });
  if (!createdRider || !(await prisma.wallet.findUnique({ where: { ownerId_ownerModel: { ownerId: riderId, ownerModel: "Rider" } } }))) throw new Error("Rider account or wallet creation failed");
  const selfUpdated = await riderAccountsRepository.updateSelf(riderId, { name: "Updated Termination Smoke Rider" });
  if (selfUpdated.name !== "Updated Termination Smoke Rider") throw new Error("Rider self update failed");
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      deliveryAddress: { stateId, cityId },
      phone: user.phone || "08000000000",
      subtotal: 1000,
      deliveryFee: 200,
      total: 1200,
      orderCode: `TERM-${suffix}`,
      paymentStatus: "paid",
      orderStatus: "ready_for_pickup",
    },
  });
  orderId = order.id;
  const vendorOrder = await prisma.vendorOrder.create({ data: { restaurantId: vendor.id, userOrderId: order.id, orderStatus: "ready_for_pickup" } });
  await riderAccountsRepository.assign(order.id, rider.id, vendor.id);
  await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: { orderStatus: "out_for_delivery", riderAssignment: { status: "picked_up" } } }),
    prisma.vendorOrder.update({ where: { id: vendorOrder.id }, data: { orderStatus: "out_for_delivery" } }),
    prisma.rider.update({ where: { id: rider.id }, data: { status: "on_delivery" } }),
    prisma.riderAssignment.updateMany({ where: { orderId: order.id, riderId: rider.id }, data: { status: "picked_up" } }),
  ]);
  const history = await riderHistoryRepository.get(rider.id);
  if (!history || history.analytics.totalOrders !== 1 || history.deliveries.length !== 1) throw new Error("Rider history read failed");

  await riderSelfRepository.reportUndeliverable(vendorOrder.id, rider.id, "smoke dispute");
  const disputed = await prisma.order.findUnique({ where: { id: order.id } });
  if (disputed.orderStatus !== "disputed_delivery") throw new Error("Undeliverable transition failed");
  const escalated = await disputeRepository.escalate(order.id);
  if (escalated.skipped) throw new Error("Dispute escalation failed");
  const remake = await disputeRepository.respondToRemake(vendorOrder.id, vendor.id, "yes");
  if (!remake.success || !remake.accepted) throw new Error("Vendor remake response failed");
  const preparing = await prisma.order.findUnique({ where: { id: order.id } });
  if (preparing.orderStatus !== "preparing") throw new Error("Vendor remake did not reset order to preparing");
  await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: { orderStatus: "out_for_delivery" } }),
    prisma.vendorOrder.update({ where: { id: vendorOrder.id }, data: { orderStatus: "out_for_delivery" } }),
  ]);

  const result = await riderSelfRepository.terminateAssignment(vendorOrder.id, rider.id, { reason: "rider_initiated", note: "smoke" });
  const [changedOrder, changedVendorOrder, changedRider, termination, assignment] = await Promise.all([
    prisma.order.findUnique({ where: { id: order.id } }),
    prisma.vendorOrder.findUnique({ where: { id: vendorOrder.id } }),
    prisma.rider.findUnique({ where: { id: rider.id } }),
    prisma.orderTermination.findFirst({ where: { orderId: order.id } }),
    prisma.riderAssignment.findFirst({ where: { orderId: order.id, riderId: rider.id } }),
  ]);
  if (!result.foodPickedUp || changedOrder.orderStatus !== "ready_for_pickup" || changedOrder.riderId || changedVendorOrder.riderId || changedRider.currentOrderId || !termination || assignment.status !== "rejected") throw new Error("Termination state transition failed");
  const broadcast = await riderBroadcastRepository.offer(vendorOrder.id, { assignedBy: "smoke" });
  const queued = await prisma.orderBroadcastQueue.findUnique({ where: { vendorOrderId: vendorOrder.id } });
  if (broadcast.success || broadcast.reason !== "no_new_riders_to_broadcast" || !queued || queued.status !== "waiting") throw new Error("Durable no-rider broadcast queue failed");
  await riderAccountsRepository.create({ name: "Replacement Smoke Rider", phone: `replacement-${suffix}`, password: "smoke-password", vehicleType: "motorbike", isVerified: true, stateId, cityId, locationStatus: "approved" }, vendor.id);
  replacementRiderId = (await prisma.rider.findFirst({ where: { phone: `replacement-${suffix}` } })).id;
  await prisma.rider.update({ where: { id: replacementRiderId }, data: { status: "available" } });
  const rebroadcast = await riderBroadcastRepository.offer(vendorOrder.id, { assignedBy: "smoke:replacement" });
  const replacementAssignment = await prisma.riderAssignment.findFirst({ where: { vendorOrderId: vendorOrder.id, riderId: replacementRiderId, status: "pending" } });
  if (!rebroadcast.success || rebroadcast.riderCount !== 1 || !replacementAssignment) throw new Error(`PostgreSQL rider rebroadcast failed: ${JSON.stringify({success:rebroadcast.success,reason:rebroadcast.reason,riderCount:rebroadcast.riderCount,assignment:Boolean(replacementAssignment)})}`);
  console.log(JSON.stringify({ ok: true, riderAccountAndWallet: true, riderSelfUpdate: true, vendorManualAssignment: true, riderHistoryAnalytics: true, atomicReset: true, terminationHistory: true, postPickupStrike: changedRider.metadata?.terminationStrikes === 1, undeliverableTransition: true, disputeEscalation: true, vendorRemakeResponse: true, durableBroadcastQueue: true, automaticRebroadcast: true }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  if (orderId) await prisma.order.delete({ where: { id: orderId } }).catch(() => {});
  if (riderId) await prisma.wallet.deleteMany({ where: { ownerId: riderId, ownerModel: "Rider" } }).catch(() => {});
  if (replacementRiderId) await prisma.wallet.deleteMany({ where: { ownerId: replacementRiderId, ownerModel: "Rider" } }).catch(() => {});
  if (replacementRiderId) await prisma.rider.delete({ where: { id: replacementRiderId } }).catch(() => {});
  if (riderId) await prisma.rider.delete({ where: { id: riderId } }).catch(() => {});
  if (cityId) await prisma.city.delete({ where: { id: cityId } }).catch(() => {});
  if (stateId) await prisma.state.delete({ where: { id: stateId } }).catch(() => {});
  await prisma.$disconnect();
}
