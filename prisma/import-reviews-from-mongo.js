import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import Reviews from "../model/reviews/review.model.js";
import User from "../model/user.model.js";

const stats = {
  users: 0,
  reviews: 0,
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

const resolveUserId = async (mongoId) => {
  if (!mongoId) return null;
  const user = await prisma.user.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return user?.id || null;
};

const resolveVendorId = async (mongoId) => {
  if (!mongoId) return null;
  const vendor = await prisma.vendor.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return vendor?.id || null;
};

const resolveMenuItemId = async (mongoId) => {
  if (!mongoId) return null;
  const item = await prisma.menuItem.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return item?.id || null;
};

const importReviewUsers = async (dryRun, limit) => {
  const reviewUserIds = await Reviews.distinct("userId");
  const query = { _id: { $in: reviewUserIds } };
  const users = limit ? await User.find(query).limit(limit).lean() : await User.find(query).lean();

  for (const user of users) {
    const data = {
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
    };

    await write(
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
  }
};

const importReviews = async (dryRun, limit) => {
  const query = Reviews.find({}).sort({ createdAt: -1 });
  if (limit) query.limit(limit);
  const reviews = await query.lean();

  for (const review of reviews) {
    const userId = await resolveUserId(review.userId);
    const vendorId = await resolveVendorId(review.vendorId);
    const foodId = await resolveMenuItemId(review.foodId);

    if (!userId || !vendorId) {
      stats.skipped.push(`review:${review._id}: missing user/vendor`);
      continue;
    }

    if (review.foodId && !foodId) {
      stats.skipped.push(`review:${review._id}: missing food ${review.foodId}`);
      continue;
    }

    const data = {
      legacyMongoId: toLegacyId(review._id),
      userId,
      vendorId,
      foodId,
      rating: review.rating,
      comment: review.comment || null,
      createdAt: asDate(review.createdAt),
      updatedAt: asDate(review.updatedAt),
    };

    await write(
      `review ${review._id}`,
      () =>
        prisma.review.upsert({
          where: { legacyMongoId: data.legacyMongoId },
          create: data,
          update: data,
        }),
      dryRun
    );
    stats.reviews += 1;
  }
};

const importAll = async () => {
  const { dryRun, limit } = parseArgs();

  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  await mongoose.connect(process.env.MONGO_URI);

  try {
    await importReviewUsers(dryRun, limit);
    await importReviews(dryRun, limit);
    console.log(JSON.stringify({ dryRun, stats }, null, 2));
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

importAll().catch(async (error) => {
  console.error("Mongo to Postgres review import failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
