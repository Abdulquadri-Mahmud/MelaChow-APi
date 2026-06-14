import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

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

const importUsers = async (dryRun, limit) => {
  const query = User.find({}).sort({ createdAt: 1 });
  if (limit) query.limit(limit);
  const users = await query.lean();

  for (const user of users) {
    const data = userData(user);
    const savedUser = await write(
      `user ${user._id}`,
      () =>
        prisma.user.upsert({
          where: { legacyMongoId: data.legacyMongoId },
          create: data,
          update: data,
        }),
      dryRun
    );
    stats.users += 1;

    if (dryRun || !savedUser) continue;

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
  }
};

const importAll = async () => {
  const { dryRun, limit } = parseArgs();

  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  await mongoose.connect(process.env.MONGO_URI);

  try {
    await importUsers(dryRun, limit);
    console.log(JSON.stringify({ dryRun, stats }, null, 2));
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
