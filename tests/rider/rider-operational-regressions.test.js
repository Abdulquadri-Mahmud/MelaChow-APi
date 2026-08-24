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

  it("allows unchanged location fields in admin edits during a delivery", async () => {
    const mongo = await source("../../services/rider.service.js");
    expect(mongo).toContain("changesActiveAssignmentFields");
    expect(mongo).toContain("error.statusCode = 409");
  });
});
