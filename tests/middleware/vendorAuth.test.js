import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

// ── Mock dependencies before importing the module under test ──────────────────
jest.unstable_mockModule("../../middleware/tokenBlocklist.js", () => ({
    isTokenBlocked: jest.fn(),
    blockToken: jest.fn()
}));

jest.unstable_mockModule("../../model/vendor/vendor.model.js", () => ({
    default: { findById: jest.fn() }
}));

const { isTokenBlocked } = await import("../../middleware/tokenBlocklist.js");
const { default: vendorModel } = await import("../../model/vendor/vendor.model.js");
const { default: authVendor } = await import("../../middleware/vendor.middleware.js");

const JWT_SECRET = "test_secret_key_32_chars_minimum_x";

const makeToken = (payload = {}) =>
    jwt.sign({ id: 'vendor123', role: 'vendor', type: 'access', ...payload }, JWT_SECRET, { expiresIn: '1h' });

const makeExpiredToken = () =>
    jwt.sign({ id: 'vendor123', type: 'access' }, JWT_SECRET, { expiresIn: -1 });

const mockVendor = {
    _id: "vendor123",
    storeName: "Test Buka",
    email: "vendor@melachow.com",
    active: true,
    deletedAt: null,
};

const makeReq = (overrides = {}) => ({
    cookies: {},
    headers: {},
    ...overrides,
});

const makeRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
});

beforeEach(() => {
    jest.clearAllMocks();
    isTokenBlocked.mockResolvedValue(false);
    vendorModel.findById.mockResolvedValue({ ...mockVendor });
});

describe("authVendor middleware — JWT blocklist", () => {

    describe("MISSING token", () => {
        it("returns 401 when no token provided", async () => {
            const req = makeReq();
            const res = makeRes();
            const next = jest.fn();

            await authVendor(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe("BLOCKED token", () => {
        it("returns 401 and skips DB lookup when vendor token is blocked", async () => {
            const token = makeToken();
            isTokenBlocked.mockResolvedValue(true);

            const req = makeReq({ cookies: { vendorToken: token } });
            const res = makeRes();
            const next = jest.fn();

            await authVendor(req, res, next);

            expect(isTokenBlocked).toHaveBeenCalledWith(token);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining("revoked"),
                })
            );
            expect(vendorModel.findById).not.toHaveBeenCalled();
            expect(next).not.toHaveBeenCalled();
        });

        it("reads token from Authorization header when no vendorToken cookie", async () => {
            const token = makeToken();
            isTokenBlocked.mockResolvedValue(true);

            const req = makeReq({
                cookies: {},
                headers: { authorization: `Bearer ${token}` },
            });
            const res = makeRes();
            const next = jest.fn();

            await authVendor(req, res, next);

            expect(isTokenBlocked).toHaveBeenCalledWith(token);
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    describe("INACTIVE vendor", () => {
        it("returns 403 when vendor account is inactive (active: false)", async () => {
            const token = makeToken();
            vendorModel.findById.mockResolvedValue({
                ...mockVendor,
                active: false,
            });

            const req = makeReq({ cookies: { vendorToken: token } });
            const res = makeRes();
            const next = jest.fn();

            await authVendor(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("inactive") })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it("returns 403 for soft-deleted vendor (deletedAt is set)", async () => {
            const token = makeToken();
            vendorModel.findById.mockResolvedValue({
                ...mockVendor,
                active: true,
                deletedAt: new Date("2024-01-01"),
            });

            const req = makeReq({ cookies: { vendorToken: token } });
            const res = makeRes();
            const next = jest.fn();

            await authVendor(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe("VALID token — happy path", () => {
        it("calls next() and attaches vendor to req for valid, unblocked, active vendor", async () => {
            const token = makeToken();

            const req = makeReq({ cookies: { vendorToken: token } });
            const res = makeRes();
            const next = jest.fn();

            await authVendor(req, res, next);

            expect(isTokenBlocked).toHaveBeenCalledWith(token);
            expect(vendorModel.findById).toHaveBeenCalledWith("vendor123");
            expect(req.vendor).toBeDefined();
            expect(req.vendor._id).toBe("vendor123");
            expect(next).toHaveBeenCalledTimes(1);
        });
    });

    describe("EXPIRED token", () => {
        it("returns 401 with expired message", async () => {
            const token = makeExpiredToken();

            const req = makeReq({ cookies: { vendorToken: token } });
            const res = makeRes();
            const next = jest.fn();

            await authVendor(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("expired") })
            );
        });
    });
});
