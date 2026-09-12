import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

describe("rider operational regressions", () => {
  it("broadcasts only to atomically reserved available riders", async () => {
    const [mongo, postgres] = await Promise.all([
      source("../../services/riderAssignment.service.js"),
      source("../../services/postgres/riderBroadcast.repository.js"),
    ]);
    expect(mongo).toContain('status: "available"');
    expect(mongo).toContain("reservedRiderIds");
    expect(postgres).toContain('status:"available",currentOrderId:null');
    expect(postgres).toContain("reservedRiders");
    expect(postgres).not.toContain('status:{in:["available","pending_assignment","on_delivery"]}');
  });

  it("uses the PostgreSQL pickup state for OTP validation", async () => {
    const controller = await source("../../controller/rider.controller.js");
    expect(controller).toContain("getDeliveryOtpContext(orderId, riderId)");
    const otpRepository = await source("../../services/postgres/riderOtp.repository.js");
    expect(otpRepository).toContain("export const getDeliveryOtpContext");
  });

  it("uses Redis with PostgreSQL fallback for delivery confirmation codes", async () => {
    const otpService = await source("../../services/otp.service.js");
    expect(otpService).toContain("storeDeliveryOtpSession");
    expect(otpService).toContain("getDeliveryOtpSession");
    expect(otpService).not.toContain("import mongoose");
    expect(otpService).not.toContain("OtpFallback");
    expect(otpService).not.toContain("model/user.model.js");
  });

  it("returns delivery codes for PostgreSQL UUID orders on customer tracking", async () => {
    const orderController = await source("../../controller/order/orderController.js");
    expect(orderController).toContain("getActiveDeliveryOTP(result.order._id)");
    expect(orderController).not.toMatch(/\^\[0-9a-fA-F\]\{24\}\$[\s\S]{0,160}getActiveDeliveryOTP\(result\.order\._id\)/);
  });

  it("confirms delivery without casting PostgreSQL order UUIDs as Mongo ObjectIds", async () => {
    const controller = await source("../../controller/rider.controller.js");
    const confirmationBlock = controller.slice(
      controller.indexOf("export const confirmDelivery"),
      controller.indexOf("export const confirmDelivery") + 5000
    );
    expect(confirmationBlock).toContain("if (usePostgresRiderAssignmentWrites())");
    expect(confirmationBlock).toContain("getDeliveryOtpContext(orderId, riderId)");
    expect(confirmationBlock).toContain("actualOrderId = context.actualOrderId");
  });

  it("supports flat and percentage rider payouts and caps them at the collected delivery fee", async () => {
    const [repository, calculator, broadcast, adminFinance, adminOrders] = await Promise.all([
      source("../../services/postgres/riderSelf.repository.js"),
      source("../../services/postgres/riderPayout.js"),
      source("../../services/postgres/riderBroadcast.repository.js"),
      source("../../services/postgres/adminFinance.repository.js"),
      source("../../services/postgres/adminOrders.repository.js"),
    ]);
    expect(calculator).toContain('riderPayoutType === "percentage"');
    expect(calculator).toContain("Math.min(fee, configuredPayout)");
    expect(repository).toContain("deliveryFee = Number(found.order.deliveryFee || 0)");
    expect(repository).toContain("calculateRiderPayoutKobo(deliveryFee");
    expect(broadcast).toContain("calculateRiderPayoutNaira(collectedDeliveryFee");
    expect(adminFinance).toContain("calculateRiderPayoutKobo(order.deliveryFee");
    expect(adminOrders).toContain("calculateRiderPayoutKobo(order.deliveryFee");
  });

  it("returns rider profile and order earnings in naira while PostgreSQL remains in kobo", async () => {
    const [repository, accounts] = await Promise.all([
      source("../../services/postgres/riderSelf.repository.js"),
      source("../../services/postgres/riderAccounts.repository.js"),
    ]);
    expect(repository).toContain("totalEarnings: naira(rider.totalEarnings)");
    expect(repository).toContain("riderEarnings: naira(order.riderEarnings)");
    expect(repository).toContain('moneyUnit: "naira"');
    expect(accounts).toContain("totalEarnings: Number(rider.totalEarnings || 0) / 100");
    expect(accounts).toContain('moneyUnit: "naira"');
  });

  it("allows unchanged location fields in admin edits during a delivery", async () => {
    const mongo = await source("../../services/rider.service.js");
    expect(mongo).toContain("changesActiveAssignmentFields");
    expect(mongo).toContain("error.statusCode = 409");
  });

  it("reports force-available conflicts without an internal server error", async () => {
    const riderService = await source("../../services/rider.service.js");
    expect(riderService).toContain("Rider still has an active assigned order");
    expect(riderService).toMatch(/Rider still has an active assigned order[\s\S]*error\.statusCode = 409/);
  });
});
