import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import PlatformConfig from "../model/platform/PlatformConfig.model.js";
import Rider from "../model/rider.model.js";
import RiderAssignment from "../model/riderAssignment.model.js";

const mapAssignmentStatus = (value) => {
  if (value === "assigned") return "pending";
  if (["pending", "accepted", "rejected", "timeout", "picked_up", "delivered"].includes(value)) return value;
  if (value === "cancelled") return "rejected";
  return "pending";
};

const bucket = (records, keyFn) =>
  records.reduce((totals, record) => {
    const key = keyFn(record) || "null";
    totals[key] = (totals[key] || 0) + 1;
    return totals;
  }, {});

const platformConfigValue = (config) =>
  config
    ? {
        riderFixedPayout: config.riderFixedPayout ?? 600,
        riderAssignmentMode: config.riderAssignmentMode || "manual",
        riderPayoutHour: config.riderPayoutHour ?? 10,
        commissionEnabled: config.commissionEnabled || false,
        commissionRate: config.commissionRate || 0,
        serviceFeeEnabled: config.serviceFeeEnabled || false,
        serviceFeeType: config.serviceFeeType || "fixed",
        serviceFeeValue: config.serviceFeeValue || 0,
        serviceFeeCap: config.serviceFeeCap ?? 500,
      }
    : null;

const sortObject = (value) => Object.fromEntries(Object.entries(value || {}).sort(([left], [right]) => left.localeCompare(right)));

const compare = (label, mongoValue, postgresValue) => ({
  label,
  match: JSON.stringify(mongoValue) === JSON.stringify(postgresValue),
  mongo: mongoValue,
  postgres: postgresValue,
});

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  await mongoose.connect(process.env.MONGO_URI);

  try {
    const [
      mongoRiders,
      mongoAssignments,
      mongoConfig,
      postgresRiders,
      postgresAssignments,
      postgresConfig,
      postgresOrders,
    ] = await Promise.all([
      Rider.find({}).select("_id status managedBy isActive isVerified deletedAt").lean(),
      RiderAssignment.find({}).select("_id orderId riderId status").lean(),
      PlatformConfig.findOne({ type: "singleton" }).lean(),
      prisma.rider.findMany({
        select: {
          legacyMongoId: true,
          status: true,
          managedBy: true,
          isActive: true,
          isVerified: true,
          deletedAt: true,
        },
      }),
      prisma.riderAssignment.findMany({
        select: {
          legacyMongoId: true,
          status: true,
        },
      }),
      prisma.platformConfig.findUnique({
        where: { type: "singleton" },
        select: { value: true },
      }),
      prisma.order.findMany({
        select: { legacyMongoId: true },
      }),
    ]);

    const postgresRiderLegacyIds = new Set(postgresRiders.map((rider) => rider.legacyMongoId).filter(Boolean));
    const postgresOrderLegacyIds = new Set(postgresOrders.map((order) => order.legacyMongoId).filter(Boolean));
    const eligibleMongoAssignments = mongoAssignments.filter(
      (assignment) =>
        postgresOrderLegacyIds.has(String(assignment.orderId || "")) &&
        postgresRiderLegacyIds.has(String(assignment.riderId || ""))
    );

    const mongoAvailable = mongoRiders.filter(
      (rider) => rider.status === "available" && rider.isActive !== false && rider.isVerified && !rider.deletedAt
    ).length;
    const postgresAvailable = postgresRiders.filter(
      (rider) => rider.status === "available" && rider.isActive !== false && rider.isVerified && !rider.deletedAt
    ).length;

    const results = [
      compare("rider total", mongoRiders.length, postgresRiders.length),
      compare("rider status buckets", sortObject(bucket(mongoRiders, (rider) => rider.status || "offline")), sortObject(bucket(postgresRiders, (rider) => rider.status))),
      compare("rider manager buckets", sortObject(bucket(mongoRiders, (rider) => rider.managedBy || "vendor")), sortObject(bucket(postgresRiders, (rider) => rider.managedBy))),
      compare("available verified active riders", mongoAvailable, postgresAvailable),
      compare("rider assignment import-eligible total", eligibleMongoAssignments.length, postgresAssignments.length),
      compare("rider assignment skipped missing dependencies", mongoAssignments.length - eligibleMongoAssignments.length, mongoAssignments.length - postgresAssignments.length),
      compare(
        "rider assignment mapped status buckets",
        sortObject(bucket(eligibleMongoAssignments, (assignment) => mapAssignmentStatus(assignment.status))),
        sortObject(bucket(postgresAssignments, (assignment) => assignment.status))
      ),
      compare("platform config value", sortObject(platformConfigValue(mongoConfig)), sortObject(postgresConfig?.value || null)),
    ];

    const diffCount = results.filter((result) => !result.match).length;
    console.log(JSON.stringify({ diffCount, results }, null, 2));
    if (diffCount) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error("Logistics support parity check failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
