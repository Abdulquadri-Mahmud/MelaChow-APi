import bcrypt from "bcryptjs";
import prisma from "../../config/prisma.js";
import MongoVendor from "../../model/vendor/vendor.model.js";
import { syncVendorPickupPoint } from "./geography.js";

export const postgresVendorIdentityEnabled = () =>
  process.env.POSTGRES_MIGRATION_ENABLED === "true" &&
  process.env.DB_VENDOR_IDENTITY_PROVIDER === "postgres";

const emailOf = (email) => String(email || "").trim().toLowerCase();
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));

const resolveLocationId = async (model, value) => {
  if (!value) return null;
  return (await model.findFirst({ where: isUuid(value) ? { id: String(value) } : { legacyMongoId: String(value) }, select: { id: true } }))?.id || null;
};

export const publicVendor = (vendor) => ({
  _id: vendor.legacyMongoId || vendor.id, id: vendor.id, name: vendor.name,
  email: vendor.email, phone: vendor.phone, storeName: vendor.storeName,
  storeSlug: vendor.storeSlug, storeDescription: vendor.storeDescription,
  logo: vendor.logo, coverImage: vendor.coverImage, address: vendor.address,
  stateId: vendor.state?.legacyMongoId || vendor.stateId,
  cityId: vendor.city?.legacyMongoId || vendor.cityId,
  locationStatus: vendor.locationStatus, requestedState: vendor.requestedState,
  requestedCity: vendor.requestedCity, cuisineTypes: vendor.cuisineTypes,
  openingHours: vendor.openingHours, totalSales: vendor.totalSales,
  totalOrders: vendor.totalOrders, commissionRate: vendor.commissionRate,
  rating: vendor.rating, ratingCount: vendor.ratingCount, verified: vendor.verified,
  isApproved: vendor.isApproved, suspended: vendor.suspended, active: vendor.active,
  isLive: vendor.isLive, publishedAt: vendor.publishedAt,
  acceptsDelivery: vendor.acceptsDelivery, flatRateDeliveryFee: vendor.flatRateDeliveryFee,
  deliveryRadiusKm: vendor.deliveryRadiusKm, tags: vendor.tags,
  pickupLatitude: vendor.pickupLatitude, pickupLongitude: vendor.pickupLongitude,
  pickupPlaceId: vendor.pickupPlaceId, pickupFormattedAddress: vendor.pickupFormattedAddress,
  pickupLocationVerifiedAt: vendor.pickupLocationVerifiedAt,
  deliveryManagedBy: vendor.deliveryManagedBy, role: vendor.role,
  moneyUnit: "kobo",
  deletedAt: vendor.deletedAt, createdAt: vendor.createdAt, updatedAt: vendor.updatedAt,
});

const includeLocation = { state: true, city: true };
export const findVendorByEmail = (email) => prisma.vendor.findFirst({ where: { email: emailOf(email) }, include: includeLocation });
export const findVendorByTokenId = (tokenId) => prisma.vendor.findFirst({
  where: isUuid(tokenId) ? { id: String(tokenId) } : { legacyMongoId: String(tokenId) }, include: includeLocation,
});

export const registerVendorIdentity = async (data) => {
  const email = emailOf(data.email);
  let vendor = await prisma.vendor.findFirst({ where: { email } });
  if (vendor?.verified) return { conflict: true, vendor };
  const stateId = await resolveLocationId(prisma.state, data.stateId);
  const cityId = await resolveLocationId(prisma.city, data.cityId);
  const write = {
    email, name: data.name, phone: data.phone, storeName: data.storeName,
    storeDescription: data.storeDescription, logo: data.logo || "",
    cuisineTypes: data.cuisineTypes || [], address: data.address || {},
    stateId, cityId, locationStatus: data.locationStatus || null,
    requestedState: data.requestedState || "", requestedCity: data.requestedCity || "",
    pickupLatitude: data.pickupLatitude ?? null,
    pickupLongitude: data.pickupLongitude ?? null,
    pickupPlaceId: data.pickupPlaceId || null,
    pickupFormattedAddress: data.pickupFormattedAddress || null,
    pickupLocationVerifiedAt: data.pickupLatitude != null && data.pickupLongitude != null ? new Date() : null,
    openingHours: data.openingHours || {}, payoutDetails: data.payoutDetails || null,
    otp: data.otp, otpExpires: data.otpExpires, verified: false,
    isApproved: false, isLive: false, publishedAt: null,
    deliveryManagedBy: "admin", termsAcceptance: data.termsAcceptance || {},
  };
  vendor = vendor
    ? await prisma.vendor.update({ where: { id: vendor.id }, data: write })
    : await prisma.vendor.create({ data: write });
  if (vendor.pickupLatitude != null && vendor.pickupLongitude != null) {
    await syncVendorPickupPoint({ id: vendor.id, latitude: vendor.pickupLatitude, longitude: vendor.pickupLongitude });
  }

  try {
    let mirror = await MongoVendor.findOne({ email }).select("+otp +otpExpires +payoutDetails");
    if (mirror) {
      Object.assign(mirror, {
        ...data, email, verified: false, isApproved: false, isLive: false,
        publishedAt: null, deliveryManagedBy: "admin",
      });
      await mirror.save();
    } else {
      mirror = await MongoVendor.create({ ...data, email, verified: false, deliveryManagedBy: "admin" });
    }
    if (!vendor.legacyMongoId) vendor = await prisma.vendor.update({ where: { id: vendor.id }, data: { legacyMongoId: String(mirror._id) } });
  } catch (error) { console.error("[vendor-identity] Mongo registration mirror failed:", error.message); }
  return { conflict: false, vendor };
};

export const verifyVendorIdentity = async ({ email, otp, setupToken, setupExpires }) => {
  const vendor = await findVendorByEmail(email);
  if (!vendor) return { error: "not_found" };
  if (String(vendor.otp || "").trim() !== String(otp).trim()) return { error: "invalid_otp" };
  if (!vendor.otpExpires || vendor.otpExpires < new Date()) return { error: "expired_otp" };
  const updated = await prisma.vendor.update({ where: { id: vendor.id }, data: {
    verified: true, otp: null, otpExpires: null, passwordSetupToken: setupToken, passwordSetupExpires: setupExpires,
  }, include: includeLocation });
  MongoVendor.updateOne({ email: vendor.email }, { $set: { verified: true, passwordSetupToken: setupToken, passwordSetupExpires: setupExpires }, $unset: { otp: 1, otpExpires: 1 } })
    .catch((error) => console.error("[vendor-identity] Mongo verification mirror failed:", error.message));
  return { vendor: updated };
};

export const setVendorIdentityPassword = async ({ email, password, setupToken }) => {
  const vendor = await findVendorByEmail(email);
  if (!vendor || !vendor.verified || vendor.passwordSetupToken !== setupToken || !vendor.passwordSetupExpires || vendor.passwordSetupExpires < new Date()) return { error: "invalid_setup" };
  if (vendor.password) return { error: "already_set" };
  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await prisma.vendor.update({ where: { id: vendor.id }, data: {
    password: passwordHash, passwordSetupToken: null, passwordSetupExpires: null, lastLogin: new Date(),
  }, include: includeLocation });
  MongoVendor.updateOne({ email: vendor.email }, { $set: { password: passwordHash, lastLogin: new Date() }, $unset: { passwordSetupToken: 1, passwordSetupExpires: 1 } })
    .catch((error) => console.error("[vendor-identity] Mongo password mirror failed:", error.message));
  return { vendor: updated };
};

export const authenticateVendorIdentity = async ({ email, password }) => {
  const vendor = await findVendorByEmail(email);
  if (!vendor || !vendor.password || !(await bcrypt.compare(password, vendor.password))) return { error: "invalid_credentials" };
  if (!vendor.verified) return { error: "verification_required" };
  if (!vendor.isApproved) return { error: "approval_required" };
  if (!vendor.active || vendor.suspended || vendor.deletedAt) return { error: "inactive" };
  if (vendor.lockUntil && vendor.lockUntil > new Date()) return { error: "locked" };
  const updated = await prisma.vendor.update({ where: { id: vendor.id }, data: { loginAttempts: 0, lockUntil: null, lastLogin: new Date() }, include: includeLocation });
  return { vendor: updated };
};

export const startVendorPasswordResetIdentity = async ({ email, otp, otpExpires }) => {
  const vendor = await findVendorByEmail(email);
  if (!vendor || !vendor.verified) return { error: "not_found" };
  const updated = await prisma.vendor.update({ where: { id: vendor.id }, data: { otp, otpExpires, resetPasswordToken: null, resetPasswordExpires: null }, include: includeLocation });
  MongoVendor.updateOne({ email: vendor.email }, { $set: { otp, otpExpires }, $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } }).catch((error) => console.error("[vendor-identity] Mongo reset OTP mirror failed:", error.message));
  return { vendor: updated };
};

export const verifyVendorPasswordResetIdentity = async ({ email, otp, resetToken, resetPasswordExpires }) => {
  const vendor = await findVendorByEmail(email);
  if (!vendor) return { error: "not_found" };
  if (String(vendor.otp || "").trim() !== String(otp || "").trim()) return { error: "invalid_otp" };
  if (!vendor.otpExpires || vendor.otpExpires < new Date()) return { error: "expired_otp" };
  await prisma.vendor.update({ where: { id: vendor.id }, data: { otp: null, otpExpires: null, resetPasswordToken: resetToken, resetPasswordExpires } });
  MongoVendor.updateOne({ email: vendor.email }, { $set: { resetPasswordToken: resetToken, resetPasswordExpires }, $unset: { otp: 1, otpExpires: 1 } }).catch((error) => console.error("[vendor-identity] Mongo reset token mirror failed:", error.message));
  return { resetToken };
};

export const completeVendorPasswordResetIdentity = async ({ email, resetToken, password }) => {
  const vendor = await findVendorByEmail(email);
  if (!vendor || vendor.resetPasswordToken !== resetToken || !vendor.resetPasswordExpires || vendor.resetPasswordExpires < new Date()) return { error: "invalid_token" };
  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await prisma.vendor.update({ where: { id: vendor.id }, data: { password: passwordHash, otp: null, otpExpires: null, resetPasswordToken: null, resetPasswordExpires: null, loginAttempts: 0, lockUntil: null, lastLogin: new Date() }, include: includeLocation });
  MongoVendor.updateOne({ email: vendor.email }, { $set: { password: passwordHash, loginAttempts: 0, lastLogin: new Date() }, $unset: { otp: 1, otpExpires: 1, resetPasswordToken: 1, resetPasswordExpires: 1, lockUntil: 1 } }).catch((error) => console.error("[vendor-identity] Mongo reset mirror failed:", error.message));
  return { vendor: updated };
};

export const getVendorDashboardIdentity = async (tokenId) => {
  const vendor = await findVendorByTokenId(tokenId);
  if (!vendor) return null;
  const pricedItem = await prisma.menuItem.findFirst({ where: { vendorId: vendor.id, isAvailable: true, isInStock: true, isArchived: false, categoryDeactivated: false, portions: { some: { price: { gt: 0 }, isAvailable: true, isInStock: true } } }, select: { id: true } });
  return { vendor, liveReadiness: { isReady: Boolean(vendor.verified && vendor.isApproved && vendor.active && !vendor.suspended && pricedItem) } };
};

export const setVendorApprovalMirror = async (mongoVendor, approved) => {
  if (!postgresVendorIdentityEnabled()) return;
  const stateId = await resolveLocationId(prisma.state, mongoVendor.stateId);
  const cityId = await resolveLocationId(prisma.city, mongoVendor.cityId);
  await prisma.vendor.updateMany({ where: { legacyMongoId: String(mongoVendor._id) }, data: {
    isApproved: approved, stateId, cityId, locationStatus: mongoVendor.locationStatus || null,
    isLive: approved ? false : Boolean(mongoVendor.isLive),
    publishedAt: approved ? null : (mongoVendor.publishedAt || null),
    requestedState: mongoVendor.requestedState || "", requestedCity: mongoVendor.requestedCity || "",
    address: mongoVendor.address?.toObject?.() || mongoVendor.address || {},
  } });
};

const editableVendorFields = new Set([
  "name", "phone", "storeName", "storeDescription", "logo", "coverImage",
  "address", "cuisineTypes", "openingHours", "acceptsDelivery",
  "flatRateDeliveryFee", "deliveryRadiusKm", "tags",
]);

export const updateVendorProfileIdentity = async (tokenId, updates = {}) => {
  const vendor = await findVendorByTokenId(tokenId);
  if (!vendor) return null;
  const data = {};
  for (const [key, value] of Object.entries(updates)) {
    if (editableVendorFields.has(key) && value !== undefined) data[key] = value;
  }

  const address = updates.address && typeof updates.address === "object" ? updates.address : null;
  const latitude = address?.latitude;
  const longitude = address?.longitude;
  const hasGooglePlace = Boolean(address?.googlePlaceId);
  const hasGoogleLocation = hasGooglePlace && Number.isFinite(Number(latitude)) && Number(latitude) >= -90 && Number(latitude) <= 90 && Number.isFinite(Number(longitude)) && Number(longitude) >= -180 && Number(longitude) <= 180;
  if (hasGooglePlace && !hasGoogleLocation) throw new Error("Select a valid Google address with coordinates");
  if (hasGoogleLocation) {
    data.address = address;
    data.pickupLatitude = Number(latitude);
    data.pickupLongitude = Number(longitude);
    data.pickupPlaceId = String(address.googlePlaceId);
    data.pickupFormattedAddress = String(address.formattedAddress || address.street || "");
    data.pickupLocationVerifiedAt = new Date();
    data.locationStatus = "approved";
    data.stateId = null;
    data.cityId = null;
    data.requestedState = String(address.state || "");
    data.requestedCity = String(address.city || "");
  }

  // Address selectors send relational IDs separately from the display text.
  // Keep those PostgreSQL relations synchronized so city-level fees and other
  // location rules never continue using a vendor's previous city.
  if (updates.stateId !== undefined) {
    const stateId = await resolveLocationId(prisma.state, updates.stateId);
    if (stateId) data.stateId = stateId;
  }
  if (updates.cityId !== undefined) {
    const cityId = await resolveLocationId(prisma.city, updates.cityId);
    if (cityId) {
      const city = await prisma.city.findFirst({
        where: { id: cityId, ...(data.stateId ? { stateId: data.stateId } : {}) },
        select: { id: true, stateId: true },
      });
      if (city) {
        data.cityId = city.id;
        if (!data.stateId) data.stateId = city.stateId;
      }
    }
  }
  const updated = await prisma.vendor.update({ where: { id: vendor.id }, data, include: includeLocation });
  if (hasGoogleLocation) {
    await syncVendorPickupPoint({ id: updated.id, latitude: updated.pickupLatitude, longitude: updated.pickupLongitude });
  }
  return updated;
};

export const updateVendorTodayHoursIdentity = async (tokenId, day, hours) => {
  const vendor = await findVendorByTokenId(tokenId);
  if (!vendor) return null;
  const openingHours = { ...(vendor.openingHours || {}), [day]: hours };
  return prisma.vendor.update({ where: { id: vendor.id }, data: { openingHours }, include: includeLocation });
};

export const setVendorLiveStatusIdentity = async (tokenId, isLive) => {
  const vendor = await findVendorByTokenId(tokenId);
  if (!vendor) return { error: "not_found" };
  if (isLive && (!vendor.verified || !vendor.isApproved || vendor.suspended || !vendor.active)) {
    return { error: "not_eligible" };
  }
  if (isLive) {
    const pricedItem = await prisma.menuItem.findFirst({
      where: {
        vendorId: vendor.id, isAvailable: true, isInStock: true, isArchived: false,
        categoryDeactivated: false,
        portions: { some: { price: { gt: 0 }, isAvailable: true, isInStock: true } },
      },
      select: { id: true },
    });
    if (!pricedItem) return { error: "menu_required" };
  }
  const updated = await prisma.vendor.update({
    where: { id: vendor.id },
    data: { isLive, publishedAt: isLive ? (vendor.publishedAt || new Date()) : null },
    include: includeLocation,
  });
  return { vendor: updated };
};

export const setVendorDeletedIdentity = async (tokenId, deleted) => {
  const vendor = await findVendorByTokenId(tokenId);
  if (!vendor) return null;
  return prisma.vendor.update({
    where: { id: vendor.id },
    data: deleted
      ? { deletedAt: new Date(), active: false, isLive: false, publishedAt: null }
      : { deletedAt: null, active: true },
    include: includeLocation,
  });
};
