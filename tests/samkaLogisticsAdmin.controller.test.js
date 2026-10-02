import { jest } from "@jest/globals";

const logisticsAdmin = { approveRider: jest.fn() };
jest.unstable_mockModule("../services/logistics/samkaLogisticsAdmin.service.js", () => ({ samkaLogisticsAdmin: logisticsAdmin }));
const { approveRider } = await import("../controller/Admin/samkaLogisticsAdmin.controller.js");

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

describe("Samka logistics admin controller", () => {
  beforeEach(() => jest.clearAllMocks());

  it("uses the PostgreSQL admin UUID for rider approval", async () => {
    logisticsAdmin.approveRider.mockResolvedValue(true);
    const res = response();
    await approveRider({ postgresAdminId: "0199d2d7-5f40-7b6d-87dd-c3e7558da245", params: { riderId: "rider-id" } }, res);
    expect(logisticsAdmin.approveRider).toHaveBeenCalledWith("0199d2d7-5f40-7b6d-87dd-c3e7558da245", "rider-id");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, data: true });
  });

  it("does not send a Mongo ID to Samka as the source admin UUID", async () => {
    const res = response();
    await approveRider({ admin: { _id: "65f012345678901234567890" }, params: { riderId: "rider-id" } }, res);
    expect(logisticsAdmin.approveRider).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.body.message).toMatch(/PostgreSQL MelaChow admin UUID/);
  });

  it("turns a Samka upstream 401 into a gateway error instead of an admin logout", async () => {
    logisticsAdmin.approveRider.mockRejectedValue(Object.assign(new Error("Upstream unauthorized"), { status: 401 }));
    const res = response();
    await approveRider({ postgresAdminId: "0199d2d7-5f40-7b6d-87dd-c3e7558da245", params: { riderId: "rider-id" } }, res);
    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe("SAMKA_UPSTREAM_UNAUTHORIZED");
    expect(res.body.upstreamStatus).toBe(401);
  });
});
