import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";

const databaseId = "c56ee91b-4766-4a33-94e5-9a13b47d4fed";
const legacyMongoId = "65f012345678901234567890";

jest.unstable_mockModule("../middleware/tokenBlocklist.js", () => ({ isTokenBlocked: jest.fn().mockResolvedValue(false) }));
jest.unstable_mockModule("../services/postgres/compat.js", () => ({ usePostgresAdminWrites: () => true }));
jest.unstable_mockModule("../services/postgres/adminAccount.repository.js", () => ({
  adminAccountRepository: {
    getWithDatabaseId: jest.fn().mockResolvedValue({ admin: { id: legacyMongoId, isActive: true }, databaseId }),
  },
}));
jest.unstable_mockModule("../model/Admin/admin.model.js", () => ({ default: { findById: jest.fn() } }));

const { adminAuth } = await import("../middleware/adminAuth.js");

describe("PostgreSQL admin identity in admin authentication", () => {
  it("keeps the compatibility Mongo ID on the admin object but passes the PostgreSQL UUID separately", async () => {
    const token = jwt.sign({ id: legacyMongoId, role: "super-admin", type: "access" }, process.env.JWT_SECRET);
    const req = { cookies: { adminToken: token }, headers: {} };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    const next = jest.fn();

    await adminAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.admin.id).toBe(legacyMongoId);
    expect(req.postgresAdminId).toBe(databaseId);
  });
});
