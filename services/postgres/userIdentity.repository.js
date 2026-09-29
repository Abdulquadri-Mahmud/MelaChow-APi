import bcrypt from "bcryptjs";
import prisma from "../../config/prisma.js";
import MongoUser from "../../model/user.model.js";
import { syncUserAddressPoint } from "./geography.js";

export const postgresUserIdentityEnabled = () =>
  process.env.POSTGRES_MIGRATION_ENABLED === "true" &&
  process.env.DB_USER_IDENTITY_PROVIDER === "postgres";

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

export const publicUser = (user) => ({
  _id: user.legacyMongoId || user.id,
  id: user.id,
  firstname: user.firstname,
  lastname: user.lastname,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  avatar: user.avatar,
  walletBalance: user.walletBalance,
  totalOrders: user.totalOrders,
  isVerified: user.isVerified,
  isActive: user.isActive,
  suspended: user.suspended,
  banned: user.banned,
  role: user.role,
  addresses: (user.addresses || []).map((address) => ({
    _id: address.legacyMongoId || address.id,
    id: address.id,
    label: address.label,
    addressLine: address.addressLine,
    city: address.cityText || address.city?.name || address.cityName,
    state: address.stateText || address.state?.name || address.stateName,
    cityName: address.cityName || address.city?.name || address.cityText,
    stateName: address.stateName || address.state?.name || address.stateText,
    cityId: address.city?.legacyMongoId || address.cityId || null,
    stateId: address.state?.legacyMongoId || address.stateId || null,
    postalCode: address.postalCode,
    coordinates: address.latitude == null || address.longitude == null
      ? undefined
      : { lat: address.latitude, lng: address.longitude },
    provider: address.provider,
    providerPlaceId: address.providerPlaceId,
    formattedAddress: address.formattedAddress,
    locationSource: address.locationSource,
    locationVerifiedAt: address.locationVerifiedAt,
    isDefault: address.isDefault,
  })),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const includeAddresses = { addresses: { orderBy: { createdAt: "asc" }, include: { city: true, state: true } } };

export const findIdentityByEmail = (email) =>
  prisma.user.findUnique({ where: { email: normalizeEmail(email) }, include: includeAddresses });

export const findIdentityByTokenId = (tokenId) =>
  prisma.user.findFirst({
    where: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(tokenId))
      ? { id: tokenId }
      : { legacyMongoId: String(tokenId) },
    include: includeAddresses,
  });

export const registerIdentity = async ({ email, firstname, lastname, phone, otp, otpExpires }) => {
  const normalizedEmail = normalizeEmail(email);
  let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (user?.isVerified) return { conflict: true, user };

  user = user
    ? await prisma.user.update({
        where: { id: user.id },
        data: { firstname: firstname || user.firstname, lastname: lastname || user.lastname, phone: phone || user.phone, otp, otpExpires },
      })
    : await prisma.user.create({ data: { email: normalizedEmail, firstname, lastname, phone, otp, otpExpires, isVerified: false } });

  try {
    let mirror = await MongoUser.findOne({ email: normalizedEmail }).select("+otp +otpExpires");
    if (mirror) {
      mirror.firstname = firstname || mirror.firstname;
      mirror.lastname = lastname || mirror.lastname;
      mirror.phone = phone || mirror.phone;
      mirror.otp = otp;
      mirror.otpExpires = otpExpires;
      mirror.isVerified = false;
      await mirror.save();
    } else {
      mirror = await MongoUser.create({ email: normalizedEmail, firstname, lastname, phone, otp, otpExpires, isVerified: false });
    }
    if (!user.legacyMongoId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { legacyMongoId: String(mirror._id) } });
    }
  } catch (error) {
    console.error("[user-identity] Mongo registration mirror failed:", error.message);
  }
  return { conflict: false, user };
};

export const verifyIdentity = async ({ email, otp }) => {
  const user = await findIdentityByEmail(email);
  if (!user) return { error: "not_found" };
  if (String(user.otp || "").trim() !== String(otp).trim()) return { error: "invalid_otp" };
  if (!user.otpExpires || user.otpExpires < new Date()) return { error: "expired_otp" };
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isVerified: true, otp: null, otpExpires: null },
    include: includeAddresses,
  });
  MongoUser.updateOne({ email: user.email }, { $set: { isVerified: true }, $unset: { otp: 1, otpExpires: 1 } })
    .catch((error) => console.error("[user-identity] Mongo verification mirror failed:", error.message));
  return { user: updated };
};

export const setIdentityPassword = async ({ email, password }) => {
  const user = await findIdentityByEmail(email);
  if (!user || !user.isVerified) return { error: "not_found" };
  if (user.password) return { error: "already_set" };
  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await prisma.user.update({
    where: { id: user.id }, data: { password: passwordHash, lastLogin: new Date() }, include: includeAddresses,
  });
  MongoUser.updateOne({ email: user.email }, { $set: { password: passwordHash, lastLogin: new Date() } })
    .catch((error) => console.error("[user-identity] Mongo password mirror failed:", error.message));
  return { user: updated };
};

export const authenticateIdentity = async ({ email, password }) => {
  const user = await findIdentityByEmail(email);
  if (!user || !user.password) return { error: "invalid_credentials" };
  if (!user.isVerified) return { error: "verification_required", user };
  if (!user.isActive || user.suspended || user.banned) return { error: "inactive" };
  if (user.lockUntil && user.lockUntil > new Date()) return { error: "locked" };
  if (!(await bcrypt.compare(password, user.password))) {
    const attempts = user.loginAttempts + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: attempts >= 5 ? { loginAttempts: attempts, lockUntil: new Date(Date.now() + 15 * 60 * 1000) } : { loginAttempts: attempts },
    });
    return { error: attempts >= 5 ? "locked" : "invalid_credentials", attemptsLeft: Math.max(0, 5 - attempts) };
  }
  const updated = await prisma.user.update({
    where: { id: user.id }, data: { loginAttempts: 0, lockUntil: null, lastLogin: new Date() }, include: includeAddresses,
  });
  MongoUser.updateOne({ email: user.email }, { $set: { loginAttempts: 0, lastLogin: new Date() }, $unset: { lockUntil: 1 } })
    .catch((error) => console.error("[user-identity] Mongo login mirror failed:", error.message));
  return { user: updated };
};

export const startIdentityPasswordReset = async ({ email, otp, otpExpires }) => {
  const user = await findIdentityByEmail(email);
  if (!user || !user.isVerified) return { error: "not_found" };
  const updated = await prisma.user.update({ where: { id: user.id }, data: { otp, otpExpires, resetPasswordToken: null, resetPasswordExpires: null }, include: includeAddresses });
  MongoUser.updateOne({ email: user.email }, { $set: { otp, otpExpires }, $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 } }).catch((error) => console.error("[user-identity] Mongo reset OTP mirror failed:", error.message));
  return { user: updated };
};

export const verifyIdentityPasswordResetOtp = async ({ email, otp, resetToken, resetPasswordExpires }) => {
  const user = await findIdentityByEmail(email);
  if (!user) return { error: "not_found" };
  if (String(user.otp || "").trim() !== String(otp || "").trim()) return { error: "invalid_otp" };
  if (!user.otpExpires || user.otpExpires < new Date()) return { error: "expired_otp" };
  await prisma.user.update({ where: { id: user.id }, data: { otp: null, otpExpires: null, resetPasswordToken: resetToken, resetPasswordExpires } });
  MongoUser.updateOne({ email: user.email }, { $set: { resetPasswordToken: resetToken, resetPasswordExpires }, $unset: { otp: 1, otpExpires: 1 } }).catch((error) => console.error("[user-identity] Mongo reset token mirror failed:", error.message));
  return { resetToken };
};

export const completeIdentityPasswordReset = async ({ email, resetToken = null, otp = null, password }) => {
  const user = await findIdentityByEmail(email);
  if (!user) return { error: "not_found" };
  if (resetToken) {
    if (user.resetPasswordToken !== resetToken || !user.resetPasswordExpires || user.resetPasswordExpires < new Date()) return { error: "invalid_token" };
  } else if (String(user.otp || "").trim() !== String(otp || "").trim() || !user.otpExpires || user.otpExpires < new Date()) return { error: "invalid_otp" };
  const passwordHash = await bcrypt.hash(password, 12);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { password: passwordHash, otp: null, otpExpires: null, resetPasswordToken: null, resetPasswordExpires: null, loginAttempts: 0, lockUntil: null, lastLogin: new Date() }, include: includeAddresses });
  MongoUser.updateOne({ email: user.email }, { $set: { password: passwordHash, loginAttempts: 0, lastLogin: new Date() }, $unset: { otp: 1, otpExpires: 1, resetPasswordToken: 1, resetPasswordExpires: 1, lockUntil: 1 } }).catch((error) => console.error("[user-identity] Mongo password reset mirror failed:", error.message));
  return { user: updated };
};

export const updateIdentityProfile = async (userId, data) => {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { firstname: data.firstname, lastname: data.lastname, phone: data.phone, avatar: data.avatar },
    include: includeAddresses,
  });
  MongoUser.updateOne({ email: updated.email }, { $set: data })
    .catch((error) => console.error("[user-identity] Mongo profile mirror failed:", error.message));
  return updated;
};

const resolveLocation = async (model, value) => {
  if (!value) return null;
  const record = await model.findFirst({ where: { OR: [{ legacyMongoId: String(value) }, ...( /^[0-9a-f-]{36}$/i.test(String(value)) ? [{ id: String(value) }] : [])] } });
  return record?.id || null;
};

export const addIdentityAddress = async (userId, input) => {
  let stateUuid = await resolveLocation(prisma.state, input.stateId);
  if (!stateUuid && input.state && input.provider !== "google") {
    const name = String(input.state).trim().replace(/\s+state$/i, "");
    stateUuid = (await prisma.state.findFirst({ where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { name: { equals: `${name} State`, mode: "insensitive" } }] } }))?.id || null;
  }
  let cityUuid = await resolveLocation(prisma.city, input.cityId);
  if (!cityUuid && input.city && input.provider !== "google") cityUuid = (await prisma.city.findFirst({ where: { name: { equals: String(input.city).trim(), mode: "insensitive" }, ...(stateUuid ? { stateId: stateUuid } : {}) } }))?.id || null;
  if (input.cityId && !cityUuid) return { error: "invalid_city" };
  if (input.stateId && !stateUuid) return { error: "invalid_state" };
  const created = await prisma.$transaction(async (tx) => {
    if (input.isDefault) await tx.userAddress.updateMany({ where: { userId }, data: { isDefault: false } });
    return tx.userAddress.create({ data: {
      userId, label: input.label || "Home", addressLine: input.addressLine,
      cityText: input.city || null, stateText: input.state || null,
      cityId: cityUuid, stateId: stateUuid,
      cityName: input.cityName || input.city || null, stateName: input.stateName || input.state || null,
      postalCode: input.postalCode || null, latitude: input.coordinates?.lat ?? null,
      longitude: input.coordinates?.lng ?? null, provider: input.provider || null,
      providerPlaceId: input.providerPlaceId || null, formattedAddress: input.formattedAddress || null,
      locationSource: input.locationSource || null,
      locationVerifiedAt: input.coordinates ? new Date() : null, isDefault: !!input.isDefault,
    } });
  });
  if (created.latitude != null && created.longitude != null) {
    await syncUserAddressPoint({ id: created.id, latitude: created.latitude, longitude: created.longitude });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const mirror = await MongoUser.findOne({ email: user.email });
    if (mirror) {
      if (input.isDefault) mirror.addresses.forEach((address) => { address.isDefault = false; });
      mirror.addresses.push(input);
      await mirror.save();
      const mongoAddress = mirror.addresses[mirror.addresses.length - 1];
      await prisma.userAddress.update({ where: { id: created.id }, data: { legacyMongoId: String(mongoAddress._id) } });
    }
  } catch (error) {
    console.error("[user-identity] Mongo address mirror failed:", error.message);
  }
  return prisma.user.findUnique({ where: { id: userId }, include: includeAddresses });
};

const addressWhere = (userId, addressId) => ({
  userId,
  OR: [{ legacyMongoId: String(addressId) }, ...( /^[0-9a-f-]{36}$/i.test(String(addressId)) ? [{ id: String(addressId) }] : [])],
});

export const updateIdentityAddress = async (userId, addressId, input) => {
  const existing = await prisma.userAddress.findFirst({ where: addressWhere(userId, addressId) });
  if (!existing) return null;
  let stateUuid = input.provider === "google" ? null : input.stateId === undefined ? undefined : await resolveLocation(prisma.state, input.stateId);
  if (stateUuid == null && input.state && input.provider !== "google") {
    const name = String(input.state).trim().replace(/\s+state$/i, "");
    stateUuid = (await prisma.state.findFirst({ where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { name: { equals: `${name} State`, mode: "insensitive" } }] } }))?.id || null;
  }
  let cityUuid = input.provider === "google" ? null : input.cityId === undefined ? undefined : await resolveLocation(prisma.city, input.cityId);
  if (cityUuid == null && input.city && input.provider !== "google") cityUuid = (await prisma.city.findFirst({ where: { name: { equals: String(input.city).trim(), mode: "insensitive" }, ...(stateUuid ? { stateId: stateUuid } : {}) } }))?.id || null;
  if (input.cityId && !cityUuid) return { error: "invalid_city" };
  if (input.stateId && !stateUuid) return { error: "invalid_state" };
  await prisma.$transaction(async (tx) => {
    if (input.isDefault === true) await tx.userAddress.updateMany({ where: { userId }, data: { isDefault: false } });
    await tx.userAddress.update({ where: { id: existing.id }, data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.addressLine !== undefined ? { addressLine: input.addressLine } : {}),
      ...(input.city !== undefined ? { cityText: input.city, cityName: input.city } : {}),
      ...(input.state !== undefined ? { stateText: input.state, stateName: input.state } : {}),
      ...(cityUuid !== undefined ? { cityId: cityUuid } : {}), ...(stateUuid !== undefined ? { stateId: stateUuid } : {}),
      ...(input.coordinates != null ? { latitude: input.coordinates.lat, longitude: input.coordinates.lng } : {}),
      ...(input.provider !== undefined ? { provider: input.provider || null } : {}),
      ...(input.providerPlaceId !== undefined ? { providerPlaceId: input.providerPlaceId || null } : {}),
      ...(input.formattedAddress !== undefined ? { formattedAddress: input.formattedAddress || null } : {}),
      ...(input.locationSource !== undefined ? { locationSource: input.locationSource || null } : {}),
      ...(input.coordinates != null ? { locationVerifiedAt: new Date() } : {}),
      ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
    } });
  });
  if (input.coordinates != null) {
    await syncUserAddressPoint({ id: existing.id, latitude: Number(input.coordinates.lat), longitude: Number(input.coordinates.lng) });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const mirror = await MongoUser.findOne({ email: user.email });
    const address = mirror?.addresses.id(existing.legacyMongoId || addressId);
    if (address) {
      if (input.isDefault === true) mirror.addresses.forEach((item) => { item.isDefault = false; });
      for (const [key, value] of Object.entries(input)) if (value !== undefined) address[key] = value;
      await mirror.save();
    }
  } catch (error) { console.error("[user-identity] Mongo address update mirror failed:", error.message); }
  return prisma.user.findUnique({ where: { id: userId }, include: includeAddresses });
};

export const deleteIdentityAddress = async (userId, addressId) => {
  const existing = await prisma.userAddress.findFirst({ where: addressWhere(userId, addressId) });
  if (!existing) return null;
  await prisma.userAddress.delete({ where: { id: existing.id } });
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    await MongoUser.updateOne({ email: user.email }, { $pull: { addresses: { _id: existing.legacyMongoId || addressId } } });
  } catch (error) { console.error("[user-identity] Mongo address delete mirror failed:", error.message); }
  return prisma.user.findUnique({ where: { id: userId }, include: includeAddresses });
};
