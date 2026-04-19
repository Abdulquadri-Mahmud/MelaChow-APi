import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

// ── Mock dependencies before importing the module under test ──────────────────
jest.unstable_mockModule("../../middleware/tokenBlocklist.js", () => ({
    isTokenBlocked: jest.fn(),
    blockToken: jest.fn()
}));

jest.unstable_mockModule("../../model/user.model.js", () => ({
    default: { findById: jest.fn() }
}));

const { isTokenBlocked } = await import("../../middleware/tokenBlocklist.js");
const { default: User } = await import("../../model/user.model.js");
const { default: auth } = await import("../../middleware/auth.middleware.js");

// ── Helpers ───────────────────────────────────────────────────────────────────
const JWT_SECRET = "test_secret_key_32_chars_minimum_x";

const makeToken = (payload = {}, secret = JWT_SECRET) =>
    jwt.sign({ id: "user123", ...payload }, secret, { expiresIn: "1h" });

const makeExpiredToken = () =>
    jwt.sign({ id: "user123" }, JWT_SECRET, { expiresIn: -1 });

const mockUser = {
    _id: "user123",
    email: "test@melachow.com",
    firstname: "Test",
    lastname: "User",
};

const makeReq = (overrides = {}) => ({
    method: "GET",
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

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
});

beforeEach(() => {
    jest.clearAllMocks();
    isTokenBlocked.mockResolvedValue(false);
    User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser),
    });
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("auth middleware — JWT blocklist", () => {

    describe("PREFLIGHT bypass", () => {
        it("calls next() immediately for OPTIONS requests without checking token", async () => {
            const req = makeReq({ method: "OPTIONS" });
            const res = makeRes();
            const next = jest.fn();

            await auth(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(isTokenBlocked).not.toHaveBeenCalled();
        });
    });

    describe("MISSING token", () => {
        it("returns 401 when no cookie and no Authorization header", async () => {
            const req = makeReq({ cookies: {}, headers: {} });
            const res = makeRes();
            const next = jest.fn();

            await auth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("missing") })
            );
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe("BLOCKED token", () => {
        it("returns 401 and does NOT call jwt.verify when token is blocklisted", async () => {
            const token = makeToken();
            isTokenBlocked.mockResolvedValue(true);

            const req = makeReq({ cookies: { token } });
            const res = makeRes();
            const next = jest.fn();

            await auth(req, res, next);

            expect(isTokenBlocked).toHaveBeenCalledWith(token);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining("revoked"),
                })
            );
            expect(User.findById).not.toHaveBeenCalled();
            expect(next).not.toHaveBeenCalled();
        });

        it("checks blocklist using Authorization header token when no cookie", async () => {
            const token = makeToken();
            isTokenBlocked.mockResolvedValue(true);

            const req = makeReq({
                cookies: {},
                headers: { authorization: `Bearer ${token}` },
            });
            const res = makeRes();
            const next = jest.fn();

            await auth(req, res, next);

            expect(isTokenBlocked).toHaveBeenCalledWith(token);
            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it("prefers cookie token over Authorization header", async () => {
            const cookieToken = makeToken({ id: "cookie_user" });
            const headerToken = makeToken({ id: "header_user" });
            isTokenBlocked.mockResolvedValue(false);

            const req = makeReq({
                cookies: { token: cookieToken },
                headers: { authorization: `Bearer ${headerToken}` },
            });
            const res = makeRes();
            const next = jest.fn();

            await auth(req, res, next);

            expect(isTokenBlocked).toHaveBeenCalledWith(cookieToken);
            expect(isTokenBlocked).not.toHaveBeenCalledWith(headerToken);
        });

        it("rejects token immediately without hitting the database when blocked", async () => {
            const token = makeToken();
            isTokenBlocked.mockResolvedValue(true);

            const req = makeReq({ cookies: { token } });
            const res = makeRes();
            const next = jest.fn();

            await auth(req, res, next);

            expect(User.findById).not.toHaveBeenCalled();
        });
    });

    describe("EXPIRED token", () => {
        it("returns 401 with expired message for an expired token", async () => {
            const token = makeExpiredToken();
            isTokenBlocked.mockResolvedValue(false);

            const req = makeReq({ cookies: { token } });
            const res = makeRes();
            const next = jest.fn();

            await auth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("expired") })
            );
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe("INVALID token", () => {
        it("returns 403 for a token signed with wrong secret", async () => {
            const token = makeToken({}, "wrong_secret_key_different_from_env");
            isTokenBlocked.mockResolvedValue(false);

            const req = makeReq({ cookies: { token } });
            const res = makeRes();
            const next = jest.fn();

            await auth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });

        it("returns 403 for a completely malformed token string", async () => {
            isTokenBlocked.mockResolvedValue(false);

            const req = makeReq({ cookies: { token: "not.a.valid.jwt.token" } });
            const res = makeRes();
            const next = jest.fn();

            await auth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
        });
    });

    describe("VALID token — happy path", () => {
        it("calls next() and attaches user to req for a valid, unblocked token", async () => {
            const token = makeToken();

            const req = makeReq({ cookies: { token } });
            const res = makeRes();
            const next = jest.fn();

            await auth(req, res, next);

            expect(isTokenBlocked).toHaveBeenCalledWith(token);
            expect(User.findById).toHaveBeenCalledWith("user123");
            expect(req.user).toEqual(mockUser);
            expect(req.userId).toBe("user123");
            expect(next).toHaveBeenCalledTimes(1);
            expect(res.status).not.toHaveBeenCalled();
        });
    });

    describe("USER not found in DB", () => {
        it("returns 401 when user has been deleted from DB after token was issued", async () => {
            const token = makeToken();
            User.findById.mockReturnValue({
                select: jest.fn().mockResolvedValue(null),
            });

            const req = makeReq({ cookies: { token } });
            const res = makeRes();
            const next = jest.fn();

            await auth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining("not found") })
            );
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe("REDIS error handling", () => {
        it("returns 500 when blocklist check throws unexpectedly", async () => {
            const token = makeToken();
            isTokenBlocked.mockRejectedValue(new Error("Redis connection lost"));

            const req = makeReq({ cookies: { token } });
            const res = makeRes();
            const next = jest.fn();

            await auth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(next).not.toHaveBeenCalled();
        });
    });
});
