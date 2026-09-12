import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";
import Rider from "../model/rider.model.js";

const phone = process.argv.find((arg) => arg.startsWith("--phone="))?.slice(8)?.trim();
if (!phone) throw new Error("Use --phone=<rider phone>");

const legacyId = (value) => value ? String(value) : null;
const date = (value) => value ? new Date(value) : undefined;
const json = (value, fallback = {}) => value == null ? fallback : JSON.parse(JSON.stringify(value));
const resolve = async (model, value) => value
  ? (await model.findUnique({ where: { legacyMongoId: String(value) }, select: { id: true } }))?.id || null
  : null;

await mongoose.connect(process.env.MONGO_URI);
try {
  const rider = await Rider.findOne({ phone }).select("+password +otp +resetPasswordToken +payoutDetails.recipientCode").lean();
  if (!rider) throw new Error("Rider was not found in the configured MongoDB database");

  const [vendorId, stateId, cityId, platformVehicleId, currentOrderId, approvedBy] = await Promise.all([
    resolve(prisma.vendor, rider.vendorId), resolve(prisma.state, rider.stateId),
    resolve(prisma.city, rider.cityId), resolve(prisma.platformVehicle, rider.platformVehicleId),
    resolve(prisma.order, rider.currentOrderId), resolve(prisma.admin, rider.approvedBy),
  ]);
  const data = {
    legacyMongoId: legacyId(rider._id), name: rider.name || "Legacy Rider", phone: rider.phone,
    email: rider.email || null, avatar: rider.avatar || "", vendorId, stateId, cityId,
    locationStatus: ["approved", "pending_review"].includes(rider.locationStatus) ? rider.locationStatus : null,
    requestedState: rider.requestedState || "", requestedCity: rider.requestedCity || "",
    serviceZones: Array.isArray(rider.serviceZones) ? rider.serviceZones : [],
    vehicleOwnership: ["own", "platform"].includes(rider.vehicleOwnership) ? rider.vehicleOwnership : "own",
    vehicleType: ["bicycle", "motorbike"].includes(rider.vehicleType) ? rider.vehicleType : "motorbike",
    platformVehicleId, managedBy: ["vendor", "admin"].includes(rider.managedBy) ? rider.managedBy : "admin",
    password: rider.password || null, otp: rider.otp || null, otpExpires: date(rider.otpExpires),
    resetPasswordToken: rider.resetPasswordToken || null, resetPasswordExpires: date(rider.resetPasswordExpires),
    loginAttempts: rider.loginAttempts || 0, lockUntil: date(rider.lockUntil), lastLogin: date(rider.lastLogin),
    status: ["available", "pending_assignment", "on_delivery", "offline"].includes(rider.status) ? rider.status : "offline",
    currentOrderId, assignmentExpiresAt: date(rider.assignmentExpiresAt), approvedAt: date(rider.approvedAt), approvedBy,
    isActive: rider.isActive !== false, isVerified: Boolean(rider.isVerified), deletedAt: date(rider.deletedAt),
    totalDeliveries: rider.totalDeliveries || 0, totalEarnings: rider.totalEarnings || 0,
    rating: rider.rating || 0, ratingCount: rider.ratingCount || 0, notes: rider.notes || null,
    metadata: { ...json(rider.metadata), legacyApprovedBy: legacyId(rider.approvedBy), legacyCurrentOrderId: legacyId(rider.currentOrderId) },
    payoutDetails: json(rider.payoutDetails), role: "rider", createdAt: date(rider.createdAt), updatedAt: date(rider.updatedAt),
  };

  const imported = await prisma.rider.upsert({ where: { legacyMongoId: data.legacyMongoId }, create: data, update: data });
  await prisma.wallet.upsert({
    where: { ownerId_ownerModel: { ownerId: imported.id, ownerModel: "Rider" } },
    create: { ownerId: imported.id, ownerModel: "Rider", balance: 0, totalEarned: 0, totalWithdrawn: 0 },
    update: {},
  });
  console.log(JSON.stringify({ success: true, imported: true, passwordHashCopied: Boolean(imported.password) }));
} finally {
  await mongoose.disconnect();
  await prisma.$disconnect();
}
