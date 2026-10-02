import { jest, describe, it, expect, beforeEach } from "@jest/globals";
const db = {
  vendor: { findUnique: jest.fn() },
  vendorOrder: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  order: { update: jest.fn() },
  logisticsDelivery: { upsert: jest.fn() },
  $transaction: jest.fn(), $queryRaw: jest.fn(),
};
jest.unstable_mockModule("../config/prisma.js", () => ({ default: db }));
const { assertSamkaSchemaReady, recoverMissingSamkaHandoffs } = await import("../services/logistics/samkaLogistics.service.js");
const { adminOrdersRepository } = await import("../services/postgres/adminOrders.repository.js");
const vendorId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const vendorOrderId = "33333333-3333-4333-8333-333333333333";
const vendor = { id: vendorId, storeName: "Store", deliveryManagedBy: "admin" };
const order = { id: orderId, orderCode: "ORD-TEST", total: 10000, statusLog: [], vendorOrders: [{ id: vendorOrderId, orderStatus: "ready_for_pickup" }] };
const vendorOrder = { id: vendorOrderId, restaurantId: vendorId, userOrderId: orderId, orderStatus: "ready_for_pickup", restaurant: vendor, userOrder: order, items: [] };
beforeEach(() => {
  jest.resetAllMocks(); process.env.DELIVERY_PROVIDER = "samka";
  db.vendor.findUnique.mockResolvedValue(vendor);
  db.vendorOrder.findUnique.mockResolvedValue(vendorOrder);
  db.vendorOrder.update.mockReturnValue({ operation: "vendor" });
  db.order.update.mockReturnValue({ operation: "parent" });
  db.logisticsDelivery.upsert.mockReturnValue({ operation: "handoff" });
  db.$transaction.mockResolvedValue([vendorOrder]);
});
describe("Samka handoff recovery", () => {
  it("includes the handoff in the same transaction even when the order is already ready", async () => {
    const result = await adminOrdersRepository.updateVendorOrderStatus({ vendorOrderLegacyId: vendorOrderId, vendorLegacyId: vendorId, status: "ready_for_pickup" });
    expect(db.$transaction).toHaveBeenCalledWith([{ operation: "vendor" }, { operation: "parent" }, { operation: "handoff" }]);
    expect(result.notificationContext.ensureSamkaHandoff).toBe(true);
    expect(result.notificationContext.isReadyTransition).toBe(false);
    expect(db.logisticsDelivery.upsert.mock.calls[0][0].update).toEqual({});
  });
  it("propagates a transaction failure so ready cannot be acknowledged without its handoff", async () => {
    db.$transaction.mockRejectedValue(new Error("handoff insert failed"));
    await expect(adminOrdersRepository.updateVendorOrderStatus({ vendorOrderLegacyId: vendorOrderId, vendorLegacyId: vendorId, status: "ready_for_pickup" })).rejects.toThrow("handoff insert failed");
  });
  it("does not create a Samka handoff when another provider is selected", async () => {
    process.env.DELIVERY_PROVIDER = "melachow";
    await adminOrdersRepository.updateVendorOrderStatus({ vendorOrderLegacyId: vendorOrderId, vendorLegacyId: vendorId, status: "ready_for_pickup" });
    expect(db.logisticsDelivery.upsert).not.toHaveBeenCalled();
  });
  it("limits recovery to paid, platform-managed ready orders without riders or handoffs", async () => {
    db.vendorOrder.findMany.mockResolvedValue([{ id: vendorOrderId }]);
    await expect(recoverMissingSamkaHandoffs()).resolves.toBe(1);
    const query = db.vendorOrder.findMany.mock.calls[0][0];
    expect(query.where).toMatchObject({ orderStatus: "ready_for_pickup", riderId: null, restaurant: { deliveryManagedBy: "admin" }, userOrder: { paymentStatus: "paid", orderStatus: "ready_for_pickup", riderId: null }, logisticsDelivery: { is: null } });
    expect(query.take).toBe(20);
    expect(db.logisticsDelivery.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { vendorOrderId }, update: {} }));
  });
  it("fails schema verification when a required column is missing", async () => {
    db.$queryRaw.mockRejectedValue(new Error("assigned_rider missing"));
    await expect(assertSamkaSchemaReady()).rejects.toThrow("assigned_rider missing");
  });
  it("verifies both logistics and callback schema before allowing startup", async () => {
    db.$queryRaw.mockResolvedValue([]);
    await assertSamkaSchemaReady();
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
