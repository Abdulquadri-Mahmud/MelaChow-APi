import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import Admin from "../model/Admin/admin.model.js";

const stats = {
  admins: 0,
  skipped: [],
};

const toLegacyId = (value) => (value ? String(value) : null);
const asDate = (value) => (value ? new Date(value) : undefined);

const parseArgs = () => {
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has("--dry-run"),
    limit: Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 0),
  };
};

const mapRole = (value) => {
  if (value === "super-admin") return "super_admin";
  if (value === "finance-admin") return "finance_admin";
  return "admin";
};

const resolveWalletId = async (mongoWalletId) => {
  if (!mongoWalletId) return null;
  const wallet = await prisma.wallet.findUnique({
    where: { legacyMongoId: toLegacyId(mongoWalletId) },
    select: { id: true },
  });
  return wallet?.id || null;
};

const importAdmins = async ({ dryRun, limit }) => {
  const query = Admin.find({})
    .select("+password +resetPasswordToken +resetPasswordExpires +otp +otpExpires")
    .sort({ createdAt: 1 });
  if (limit) query.limit(limit);

  const admins = await query.lean();

  for (const admin of admins) {
    if (!admin.email) {
      stats.skipped.push({ id: toLegacyId(admin._id), reason: "missing email" });
      continue;
    }

    const data = {
      legacyMongoId: toLegacyId(admin._id),
      name: admin.name || admin.email,
      email: admin.email,
      password: admin.password || "",
      role: mapRole(admin.role),
      resetPasswordToken: admin.resetPasswordToken || null,
      resetPasswordExpires: asDate(admin.resetPasswordExpires),
      loginAttempts: Number(admin.loginAttempts || 0),
      lockUntil: asDate(admin.lockUntil),
      lastLogin: asDate(admin.lastLogin),
      otp: admin.otp || null,
      otpExpires: asDate(admin.otpExpires),
      walletId: await resolveWalletId(admin.wallet),
      isActive: admin.isActive !== false,
      createdAt: asDate(admin.createdAt),
      updatedAt: asDate(admin.updatedAt),
    };

    if (!dryRun) {
      await prisma.admin.upsert({
        where: { legacyMongoId: data.legacyMongoId },
        create: data,
        update: data,
      });
    }

    stats.admins += 1;
  }
};

const main = async () => {
  const options = parseArgs();
  await mongoose.connect(process.env.MONGO_URI);

  try {
    await importAdmins(options);
    console.log(JSON.stringify({ dryRun: options.dryRun, ...stats }, null, 2));
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error("Admin import failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
