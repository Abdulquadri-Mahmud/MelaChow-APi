import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

// ── Mock dependencies before importing the module under test ──────────────────
jest.unstable_mockModule("../../middleware/tokenBlocklist.js", () => ({
    isTokenBlocked: jest.fn(),
    blockToken: jest.fn()
}));

jest.unstable_mockModule("../../model/rider.model.js", () => ({
    default: { findById: jest.fn() }
}));

const { isTokenBlocked } = await import("../../middleware/tokenBlocklist.js");
const { default: Rider } = await import("../../model/rider.model.js");
const { requireRiderAuth } = await import("../../middleware/riderAuth.middleware.js");

const JWT_SECRET = "test_secret_key_32_chars_minimum_x";

const makeToken = (payload = {}) =>
    jwt.sign({ id: 'rider123', role: 'rider', type: 'access', ...payload }, JWT_SECRET, { expiresIn: '1h' });

const mockRider = {
    _id: "rider123",
    name: "Test Rider",
    phone: "08012345678",
    isActive: true,
    isVerified: true,
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
    Rider.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ ...mockRider }),
    });
});

describe("requireRiderAuth middleware — JWT blocklist", () => {

    describe("BLOCKED token", () => {
        it("returns 401 and skips DB lookup when rider token is blocked", async () => {
            const token = makeToken();
            isTokenBlocked.mockResolvedValue(true);

            const req = makeReq({ cookies: { riderToken: token } });
            const res = makeRes();
            const next = jest.fn();

            await requireRiderAuth(req, res, next);

            expect(isTokenBlocked).toHaveBeenCalledWith(token);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining("revoked"),
                })
            );
            expect(Rider.findById).not.toHaveBeenCalled();
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe("WRONG role", () => {
        it("returns 403 when token role is not 'rider'", async () => {
            // Token was issued as a vendor but hitting rider route
            const token = makeToken({ role: "vendor" });

            const req = makeReq({ cookies: { riderToken: token } });
            const res = makeRes();
            const next = jest.fn();

            await requireRiderAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("Rider role required") })
            );
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe("INACTIVE rider", () => {
        it("returns 403 when rider isActive is false", async () => {
            const token = makeToken();
            Rider.findById.mockReturnValue({
                select: jest.fn().mockResolvedValue({ ...mockRider, isActive: false }),
            });

            const req = makeReq({ cookies: { riderToken: token } });
            const res = makeRes();
            const next = jest.fn();

            await requireRiderAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe("VALID token — happy path", () => {
        it("calls next() and attaches rider to req", async () => {
            const token = makeToken();

            const req = makeReq({ cookies: { riderToken: token } });
            const res = makeRes();
            const next = jest.fn();

            await requireRiderAuth(req, res, next);

            expect(isTokenBlocked).toHaveBeenCalledWith(token);
            expect(req.rider).toBeDefined();
            expect(req.rider._id).toBe("rider123");
            expect(next).toHaveBeenCalledTimes(1);
        });
    });
});
