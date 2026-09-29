import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";
import { createMigrationControl } from "../services/postgres/migrationControl.js";

import User from "../model/user.model.js";

const stats = {
  users: 0,
  addresses: 0,
  skipped: [],
};

const toLegacyId = (value) => (value ? String(value) : null);
const asDate = (value) => (value ? new Date(value) : undefined);
const cleanJson = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  return JSON.parse(JSON.stringify(value));
};

const parseArgs = () => {
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has("--dry-run"),
    limit: Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 0),
    batchSize: Math.max(1, Number(process.argv.find((arg) => arg.startsWith("--batch-size="))?.split("=")[1] || 250)),
    restart: args.has("--restart"),
    maxErrors: Math.max(1, Number(process.argv.find((arg) => arg.startsWith("--max-errors="))?.split("=")[1] || 100)),
    id: process.argv.find((arg) => arg.startsWith("--id="))?.split("=")[1] || null,
  };
};

const write = async (label, action, dryRun) => {
  if (dryRun) return null;
  try {
    return await action();
  } catch (error) {
    error.message = `${label}: ${error.message}`;
    throw error;
  }
};

const mapRole = (value) => (["user", "vendor", "rider", "admin"].includes(value) ? value : "user");

const resolveStateId = async (mongoId) => {
  if (!mongoId) return null;
  const state = await prisma.state.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return state?.id || null;
};

const resolveCityId = async (mongoId) => {
  if (!mongoId) return null;
  const city = await prisma.city.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return city?.id || null;
};

const userData = (user) => ({
  legacyMongoId: toLegacyId(user._id),
  firstname: user.firstname || null,
  lastname: user.lastname || null,
  fullName: user.fullName || null,
  email: user.email || `legacy-user-${user._id}@melachow.local`,
  password: user.password || null,
  phone: user.phone || null,
  avatar: user.avatar || null,
  walletBalance: user.walletBalance || 0,
  totalOrders: user.totalOrders || 0,
  isVerified: user.isVerified || false,
  isActive: user.isActive !== false,
  lastLogin: asDate(user.lastLogin),
  suspended: user.suspended || false,
  banned: user.banned || false,
  suspensionReason: user.suspensionReason || null,
  banReason: user.banReason || null,
  activityLog: cleanJson(user.activityLog, []),
  role: mapRole(user.role),
  createdAt: asDate(user.createdAt),
  updatedAt: asDate(user.updatedAt),
});

const importUser = async (user, dryRun) => {
    const data = userData(user);
    const existingByLegacyId = dryRun
      ? null
      : await prisma.user.findUnique({ where: { legacyMongoId: data.legacyMongoId } });
    const existingByEmail = dryRun || existingByLegacyId
      ? null
      : await prisma.user.findUnique({ where: { email: data.email } });

    // A local test database may recreate an account with the same email but a
    // different Mongo ObjectId than the production snapshot already in PG.
    // Reconcile by email while preserving the snapshot's legacy Mongo ID.
    const updateData = existingByEmail
      ? { ...data, legacyMongoId: existingByEmail.legacyMongoId }
      : { ...data };
    // Mongoose hides password by default and some legacy accounts genuinely
    // have no password. Never erase a usable PostgreSQL hash with null.
    if (!data.password) delete updateData.password;
    const savedUser = await write(
      `user ${user._id}`,
      () =>
        existingByLegacyId || existingByEmail
          ? prisma.user.update({
              where: { id: (existingByLegacyId || existingByEmail).id },
              data: updateData,
            })
          : prisma.user.create({ data }),
      dryRun
    );
    stats.users += 1;

    if (dryRun || !savedUser) return;

    for (const address of user.addresses || []) {
      const legacyMongoId = toLegacyId(address._id);
      if (!legacyMongoId) continue;

      const cityId = await resolveCityId(address.cityId);
      const stateId = await resolveStateId(address.stateId);
      const addressData = {
        legacyMongoId,
        userId: savedUser.id,
        label: address.label || "Home",
        addressLine: address.addressLine || address.address || "",
        cityText: address.city || null,
        stateText: address.state || null,
        cityId,
        stateId,
        cityName: address.cityName || address.city || null,
        stateName: address.stateName || address.state || null,
        postalCode: address.postalCode || null,
        latitude: address.coordinates?.lat ?? null,
        longitude: address.coordinates?.lng ?? null,
        isDefault: address.isDefault || false,
        createdAt: asDate(address.createdAt),
        updatedAt: asDate(address.updatedAt || address.createdAt),
      };

      if (!addressData.addressLine) {
        stats.skipped.push(`address:${legacyMongoId}: missing address line`);
        continue;
      }

      await write(
        `address ${legacyMongoId}`,
        () =>
          prisma.userAddress.upsert({
            where: { legacyMongoId },
            create: addressData,
            update: addressData,
          }),
        dryRun
      );
      stats.addresses += 1;
    }
};

const importUsers = async ({ dryRun, limit, batchSize, restart, maxErrors, id }, control) => {
  if (id) {
    const user = await User.findById(id).select("+password").lean();
    if (!user) throw new Error(`User ${id} not found`);
    await importUser(user, dryRun);
    await control.advance(id, 1, { targeted: true });
    return;
  }
  const checkpoint = restart ? null : await control.checkpoint();
  let lastId = checkpoint?.lastSourceId || null;
  let remaining = limit || Number.POSITIVE_INFINITY;
  let errors = 0;

  while (remaining > 0) {
    const size = Math.min(batchSize, remaining);
    const filter = lastId ? { _id: { $gt: new mongoose.Types.ObjectId(lastId) } } : {};
    const users = await User.find(filter).select("+password").sort({ _id: 1 }).limit(size).lean();
    if (!users.length) break;

    for (const user of users) {
      const sourceId = toLegacyId(user._id);
      try {
        await importUser(user, dryRun);
      } catch (error) {
        errors += 1;
        stats.skipped.push(`user:${sourceId}: ${error.message}`);
        await control.reject(sourceId, error, { _id: sourceId, email: user.email || null });
        if (errors >= maxErrors) throw new Error(`Stopped after ${errors} rejected users`);
      }
      lastId = sourceId;
      remaining -= 1;
      await control.advance(lastId, 1, { errors });
      if (remaining <= 0) break;
    }
  }
};

const importAll = async () => {
  const options = parseArgs();
  const { dryRun } = options;

  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  await mongoose.connect(process.env.MONGO_URI);
  const control = createMigrationControl({ prisma, jobName: "users-backfill-v2", sourceName: "users", dryRun });

  try {
    await control.start({ batchSize: options.batchSize, limit: options.limit || null, restart: options.restart });
    await importUsers(options, control);
    const run = await control.finish("completed", { stats });
    console.log(JSON.stringify({ dryRun, run, stats }, null, 2));
  } catch (error) {
    await control.finish("failed", { error: error.message, stats });
    throw error;
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

importAll().catch(async (error) => {
  console.error("Mongo to Postgres user import failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
