import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import PlatformConfig from "../model/platform/PlatformConfig.model.js";
import PlatformVehicle from "../model/platformVehicle.model.js";
import Rider from "../model/rider.model.js";
import RiderAssignment from "../model/riderAssignment.model.js";

const stats = {
  riders: 0,
  riderAssignments: 0,
  platformVehicles: 0,
  platformConfigs: 0,
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

const resolveId = async (model, mongoId) => {
  if (!mongoId) return null;
  const record = await model.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return record?.id || null;
};

const mapRiderStatus = (value) =>
  ["available", "pending_assignment", "on_delivery", "offline"].includes(value) ? value : "offline";

const mapVehicleOwnership = (value) => (["own", "platform"].includes(value) ? value : "own");
const mapVehicleType = (value) => (["bicycle", "motorbike"].includes(value) ? value : "bicycle");
const mapManagedBy = (value) => (["vendor", "admin"].includes(value) ? value : "vendor");
const mapLocationStatus = (value) => (["approved", "pending_review"].includes(value) ? value : null);
const mapVehicleStatus = (value) => {
  if (["available", "assigned", "maintenance", "inactive"].includes(value)) return value;
  if (value === "retired") return "inactive";
  return "available";
};

const mapAssignmentStatus = (value) => {
  if (value === "assigned") return "pending";
  if (["pending", "accepted", "rejected", "timeout", "picked_up", "delivered"].includes(value)) return value;
  if (value === "cancelled") return "rejected";
  return "pending";
};

const platformConfigValue = (config) => ({
  riderFixedPayout: config.riderFixedPayout ?? 600,
  riderAssignmentMode: config.riderAssignmentMode || "manual",
  riderPayoutHour: config.riderPayoutHour ?? 10,
  commissionEnabled: config.commissionEnabled || false,
  commissionRate: config.commissionRate || 0,
  serviceFeeEnabled: config.serviceFeeEnabled || false,
  serviceFeeType: config.serviceFeeType || "fixed",
  serviceFeeValue: config.serviceFeeValue || 0,
  serviceFeeCap: config.serviceFeeCap ?? 500,
});

const importPlatformConfig = async (dryRun) => {
  const config = await PlatformConfig.findOne({ type: "singleton" }).lean();
  if (!config) return;

  const lastUpdatedBy = await resolveId(prisma.admin, config.lastUpdatedBy);
  const data = {
    legacyMongoId: toLegacyId(config._id),
    type: config.type || "singleton",
    value: platformConfigValue(config),
    lastUpdatedBy,
    createdAt: asDate(config.createdAt),
    updatedAt: asDate(config.updatedAt),
  };

  await write(
    `platformConfig ${config._id}`,
    () =>
      prisma.platformConfig.upsert({
        where: { type: data.type },
        create: data,
        update: data,
      }),
    dryRun
  );
  stats.platformConfigs += 1;
};

const importPlatformVehicles = async (dryRun, limit) => {
  const query = PlatformVehicle.find({}).sort({ createdAt: 1 });
  if (limit) query.limit(limit);
  const vehicles = await query.lean();

  for (const vehicle of vehicles) {
    const data = {
      legacyMongoId: toLegacyId(vehicle._id),
      label: vehicle.label || `Legacy Vehicle ${vehicle._id}`,
      identifier: vehicle.identifier || null,
      vehicleType: mapVehicleType(vehicle.vehicleType),
      status: mapVehicleStatus(vehicle.status),
      metadata: {
        legacyStatus: vehicle.status || "available",
        legacyStateId: toLegacyId(vehicle.stateId),
        legacyCityId: toLegacyId(vehicle.cityId),
        legacyAssignedRiderId: toLegacyId(vehicle.assignedRiderId),
        notes: vehicle.notes || "",
      },
      createdAt: asDate(vehicle.createdAt),
      updatedAt: asDate(vehicle.updatedAt),
    };

    await write(
      `platformVehicle ${vehicle._id}`,
      () =>
        prisma.platformVehicle.upsert({
          where: { legacyMongoId: data.legacyMongoId },
          create: data,
          update: data,
        }),
      dryRun
    );
    stats.platformVehicles += 1;
  }
};

const riderData = async (rider) => {
  const vendorId = await resolveId(prisma.vendor, rider.vendorId);
  const stateId = await resolveId(prisma.state, rider.stateId);
  const cityId = await resolveId(prisma.city, rider.cityId);
  const platformVehicleId = await resolveId(prisma.platformVehicle, rider.platformVehicleId);
  const currentOrderId = await resolveId(prisma.order, rider.currentOrderId);
  const approvedBy = await resolveId(prisma.admin, rider.approvedBy);

  return {
    legacyMongoId: toLegacyId(rider._id),
    name: rider.name || "Legacy Rider",
    phone: rider.phone || `legacy-rider-${rider._id}`,
    email: rider.email || null,
    avatar: rider.avatar || "",
    vendorId,
    stateId,
    cityId,
    locationStatus: mapLocationStatus(rider.locationStatus),
    requestedState: rider.requestedState || "",
    requestedCity: rider.requestedCity || "",
    serviceZones: Array.isArray(rider.serviceZones) ? rider.serviceZones : [],
    vehicleOwnership: mapVehicleOwnership(rider.vehicleOwnership),
    vehicleType: mapVehicleType(rider.vehicleType),
    platformVehicleId,
    managedBy: mapManagedBy(rider.managedBy),
    password: rider.password || null,
    otp: rider.otp || null,
    otpExpires: asDate(rider.otpExpires),
    resetPasswordToken: rider.resetPasswordToken || null,
    resetPasswordExpires: asDate(rider.resetPasswordExpires),
    loginAttempts: rider.loginAttempts || 0,
    lockUntil: asDate(rider.lockUntil),
    lastLogin: asDate(rider.lastLogin),
    status: mapRiderStatus(rider.status),
    currentOrderId,
    assignmentExpiresAt: asDate(rider.assignmentExpiresAt),
    approvedAt: asDate(rider.approvedAt),
    approvedBy,
    isActive: rider.isActive !== false,
    isVerified: rider.isVerified || false,
    deletedAt: asDate(rider.deletedAt),
    totalDeliveries: rider.totalDeliveries || 0,
    totalEarnings: rider.totalEarnings || 0,
    rating: rider.rating || 0,
    ratingCount: rider.ratingCount || 0,
    notes: rider.notes || null,
    metadata: {
      ...cleanJson(rider.metadata, {}),
      legacyApprovedBy: toLegacyId(rider.approvedBy),
      legacyCurrentOrderId: toLegacyId(rider.currentOrderId),
    },
    payoutDetails: cleanJson(rider.payoutDetails, {}),
    role: "rider",
    createdAt: asDate(rider.createdAt),
    updatedAt: asDate(rider.updatedAt),
  };
};

const importRiders = async (dryRun, limit) => {
  const query = Rider.find({}).sort({ createdAt: 1 });
  if (limit) query.limit(limit);
  const riders = await query.select("+password +otp +resetPasswordToken +payoutDetails.recipientCode").lean();

  for (const rider of riders) {
    const data = await riderData(rider);
    await write(
      `rider ${rider._id}`,
      () =>
        prisma.rider.upsert({
          where: { legacyMongoId: data.legacyMongoId },
          create: data,
          update: data,
        }),
      dryRun
    );
    stats.riders += 1;
  }
};

const assignmentData = async (assignment) => {
  const orderId = await resolveId(prisma.order, assignment.orderId);
  const riderId = await resolveId(prisma.rider, assignment.riderId);

  if (!orderId || !riderId) {
    stats.skipped.push(`riderAssignment:${assignment._id}: missing order/rider`);
    return null;
  }

  const vendorOrderId = await resolveId(prisma.vendorOrder, assignment.vendorOrderId);
  const vendorId = await resolveId(prisma.vendor, assignment.vendorId);
  const cityId = await resolveId(prisma.city, assignment.cityId);
  const stateId = await resolveId(prisma.state, assignment.stateId);
  const assignedBy = await resolveId(prisma.admin, assignment.assignedBy);
  const originalStatus = assignment.status || "assigned";

  return {
    legacyMongoId: toLegacyId(assignment._id),
    orderId,
    vendorOrderId,
    riderId,
    vendorId,
    cityId,
    stateId,
    status: mapAssignmentStatus(originalStatus),
    reason: assignment.reason || null,
    expiresAt: asDate(assignment.expiresAt),
    respondedAt: asDate(assignment.respondedAt),
    metadata: {
      ...cleanJson(assignment.metadata, {}),
      legacyStatus: originalStatus,
      assignedBy,
      assignedAt: assignment.assignedAt ? new Date(assignment.assignedAt).toISOString() : null,
    },
    createdAt: asDate(assignment.createdAt || assignment.assignedAt),
    updatedAt: asDate(assignment.updatedAt || assignment.createdAt || assignment.assignedAt),
  };
};

const importRiderAssignments = async (dryRun, limit) => {
  const query = RiderAssignment.find({}).sort({ createdAt: 1 });
  if (limit) query.limit(limit);
  const assignments = await query.lean();

  for (const assignment of assignments) {
    const data = await assignmentData(assignment);
    if (!data) continue;

    await write(
      `riderAssignment ${assignment._id}`,
      () =>
        prisma.riderAssignment.upsert({
          where: { legacyMongoId: data.legacyMongoId },
          create: data,
          update: data,
        }),
      dryRun
    );
    stats.riderAssignments += 1;
  }
};

const importAll = async () => {
  const { dryRun, limit } = parseArgs();

  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  await mongoose.connect(process.env.MONGO_URI);

  try {
    await importPlatformConfig(dryRun);
    await importPlatformVehicles(dryRun, limit);
    await importRiders(dryRun, limit);
    await importRiderAssignments(dryRun, limit);
    console.log(JSON.stringify({ dryRun, stats }, null, 2));
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

importAll().catch(async (error) => {
  console.error("Mongo to Postgres logistics support import failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
