import bcrypt from "bcryptjs";
import prisma from "../../config/prisma.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const legacyId = (row) => row?.legacyMongoId || row?.id || null;
const phoneCandidates = (value) => {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("234") && digits.length === 13 ? `0${digits.slice(3)}` : digits;
  const international = local.startsWith("0") && local.length === 11 ? `234${local.slice(1)}` : digits;
  return [...new Set([raw, digits, local, international, international ? `+${international}` : ""].filter(Boolean))];
};
const resolve = async (model, token) => {
  if (!token) return null;
  const value = String(token);
  const row = await model.findFirst({ where: { OR: [...(uuidPattern.test(value) ? [{ id: value }] : []), { legacyMongoId: value }] }, select: { id: true } });
  return row?.id || null;
};
const include = { vendor: { select: { id: true, legacyMongoId: true } }, state: { select: { id: true, legacyMongoId: true, name: true } }, city: { select: { id: true, legacyMongoId: true, name: true } }, platformVehicle: { select: { id: true, legacyMongoId: true, label: true, identifier: true, vehicleType: true, status: true } } };
const shape = (rider) => rider ? { ...rider, _id: legacyId(rider), id: legacyId(rider), vendorId: rider.vendor ? legacyId(rider.vendor) : null, stateId: rider.state ? legacyId(rider.state) : null, cityId: rider.city ? legacyId(rider.city) : null, platformVehicleId: rider.platformVehicle ? { ...rider.platformVehicle, _id: legacyId(rider.platformVehicle) } : null, totalEarnings: Number(rider.totalEarnings || 0) / 100, moneyUnit: "naira", password: undefined, otp: undefined, resetPasswordToken: undefined, isSuspended: Boolean(rider.metadata?.isSuspended), suspendedUntil: rider.metadata?.suspendedUntil || null, __v: 0 } : null;

export const riderAccountsRepository = {
  async getByToken(token, { raw = false } = {}) {
    const id = await resolve(prisma.rider, token);
    if (!id) return null;
    const rider = await prisma.rider.findUnique({ where: { id }, include });
    return raw ? rider : shape(rider);
  },

  async getSuspension(token) {
    const id = await resolve(prisma.rider, token);
    if (!id) return null;
    const rider = await prisma.rider.findUnique({ where: { id }, select: { id: true, metadata: true } });
    if (!rider) return null;
    const metadata = rider.metadata && typeof rider.metadata === "object" ? rider.metadata : {};
    const suspendedUntil = metadata.suspendedUntil ? new Date(metadata.suspendedUntil) : null;
    const active = Boolean(metadata.isSuspended) && (!suspendedUntil || suspendedUntil.getTime() > Date.now());
    if (!active && metadata.isSuspended) await prisma.rider.update({ where: { id }, data: { metadata: { ...metadata, isSuspended: false, suspendedUntil: null } } });
    return { isSuspended: active, suspendedUntil };
  },

  async setAvailability(token, status) {
    if (!["available", "offline"].includes(status)) throw new Error("Invalid rider status");
    const id = await resolve(prisma.rider, token);
    if (!id) return { error: "not_found" };
    const rider = await prisma.rider.findUnique({ where: { id }, include });
    if (!rider || rider.deletedAt) return { error: "not_found" };
    if (!rider.isActive) return { error: "inactive" };
    if (!rider.isVerified) return { error: "unverified" };
    if (rider.currentOrderId || ["pending_assignment", "on_delivery"].includes(rider.status)) {
      return { error: "active_delivery" };
    }
    const updated = await prisma.rider.update({
      where: { id },
      data: { status, assignmentExpiresAt: null },
      include,
    });
    return { rider: shape(updated) };
  },

  async authenticate(phone, password) {
    const rider = await prisma.rider.findFirst({ where: { phone: { in: phoneCandidates(phone) }, deletedAt: null }, include });
    if (!rider) return { error: "not_found" };
    if (rider.lockUntil && rider.lockUntil > new Date()) return { error: "locked" };
    if (!rider.isActive) return { error: "inactive" };
    if (!rider.isVerified) return { error: "unverified" };
    if (!rider.password || !(await bcrypt.compare(password, rider.password))) {
      const attempts = rider.loginAttempts + 1;
      await prisma.rider.update({ where: { id: rider.id }, data: { loginAttempts: attempts >= 5 ? 0 : attempts, lockUntil: attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null } });
      return { error: "invalid" };
    }
    const updated = await prisma.rider.update({ where: { id: rider.id }, data: { loginAttempts: 0, lockUntil: null, lastLogin: new Date() }, include });
    return { rider: shape(updated), databaseId: updated.id };
  },

  async beginPasswordReset(identifier, otp, expiresAt) {
    const value = String(identifier).trim();
    const rider = await prisma.rider.findFirst({ where: { deletedAt: null, OR: [{ phone: { in: phoneCandidates(value) } }, { email: value.toLowerCase() }] } });
    if (!rider) return null;
    return shape(await prisma.rider.update({ where: { id: rider.id }, data: { otp: String(otp), otpExpires: expiresAt }, include }));
  },

  async verifyPasswordReset(identifier, otp, resetToken, resetExpiresAt) {
    const value = String(identifier).trim();
    const rider = await prisma.rider.findFirst({ where: { deletedAt: null, OR: [{ phone: { in: phoneCandidates(value) } }, { email: value.toLowerCase() }] } });
    if (!rider || !rider.otp || rider.otp !== String(otp).trim() || (rider.otpExpires && rider.otpExpires < new Date())) return null;
    await prisma.rider.update({ where: { id: rider.id }, data: { otp: null, otpExpires: null, resetPasswordToken: resetToken, resetPasswordExpires: resetExpiresAt } });
    return true;
  },

  async completePasswordReset(identifier, resetToken, password) {
    const value = String(identifier).trim();
    const rider = await prisma.rider.findFirst({ where: { deletedAt: null, resetPasswordToken: resetToken, resetPasswordExpires: { gt: new Date() }, OR: [{ phone: { in: phoneCandidates(value) } }, { email: value.toLowerCase() }] } });
    if (!rider) return null;
    await prisma.rider.update({ where: { id: rider.id }, data: { password: await bcrypt.hash(password, 12), resetPasswordToken: null, resetPasswordExpires: null, loginAttempts: 0, lockUntil: null } });
    return true;
  },

  async create(body, vendorToken = null) {
    const vendorId = vendorToken ? await resolve(prisma.vendor, vendorToken) : null;
    if (vendorToken && !vendorId) throw new Error("Vendor not found or inactive");
    if (vendorId) {
      const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { deletedAt: true } });
      if (!vendor || vendor.deletedAt) throw new Error("Vendor not found or inactive");
    }
    const existingRider = await prisma.rider.findFirst({
      where: { phone: { in: phoneCandidates(body.phone) } },
    });
    if (existingRider && !existingRider.deletedAt) throw new Error("A rider with this phone number already exists");
    const [stateId, cityId, platformVehicleId] = await Promise.all([body.stateId ? resolve(prisma.state, body.stateId) : null, body.cityId ? resolve(prisma.city, body.cityId) : null, body.platformVehicleId ? resolve(prisma.platformVehicle, body.platformVehicleId) : null]);
    if ((body.stateId || body.cityId) && (!stateId || !cityId)) throw new Error("State and city must be selected together");
    if (stateId && cityId) {
      const city = await prisma.city.findFirst({ where: { id: cityId, stateId, isActive: true, state: { isActive: true } }, select: { id: true } });
      if (!city) throw new Error("Selected rider state or city is not active");
    }
    if (body.vehicleOwnership === "platform") {
      if (!platformVehicleId) throw new Error("Select an available platform vehicle for this rider");
      const vehicle = await prisma.platformVehicle.findFirst({ where: { id: platformVehicleId, status: "available", vehicleType: body.vehicleType || "motorbike", riders: { none: { deletedAt: null } } } });
      if (!vehicle) throw new Error("Selected platform vehicle is unavailable or does not match rider vehicle type");
    }
    const password = body.password ? await bcrypt.hash(body.password, 12) : null;
    const rider = await prisma.$transaction(async (tx) => {
      if (existingRider?.deletedAt) {
        const restored = await tx.rider.update({
          where: { id: existingRider.id },
          data: {
            name: body.name,
            phone: body.phone,
            email: body.email || null,
            password,
            avatar: body.avatar || "",
            vendorId,
            stateId,
            cityId,
            locationStatus: body.locationStatus || null,
            requestedState: body.requestedState || "",
            requestedCity: body.requestedCity || "",
            serviceZones: Array.isArray(body.serviceZones) ? body.serviceZones : [],
            vehicleOwnership: body.vehicleOwnership === "platform" ? "platform" : "own",
            vehicleType: body.vehicleType === "bicycle" ? "bicycle" : "motorbike",
            platformVehicleId: body.vehicleOwnership === "platform" ? platformVehicleId : null,
            managedBy: vendorId ? "vendor" : "admin",
            status: "offline",
            currentOrderId: null,
            assignmentExpiresAt: null,
            isActive: true,
            isVerified: Boolean(body.isVerified),
            deletedAt: null,
            approvedAt: body.isVerified ? new Date() : null,
            approvedBy: null,
            loginAttempts: 0,
            lockUntil: null,
            otp: null,
            otpExpires: null,
            resetPasswordToken: null,
            resetPasswordExpires: null,
            payoutDetails: body.payoutDetails || { payoutEnabled: false },
            metadata: {},
          },
          include,
        });
        const wallet = await tx.wallet.findFirst({ where: { ownerId: restored.id, ownerModel: "Rider" }, select: { id: true } });
        if (!wallet) await tx.wallet.create({ data: { ownerId: restored.id, ownerModel: "Rider", balance: 0, totalEarned: 0, totalWithdrawn: 0 } });
        if (platformVehicleId) await tx.platformVehicle.update({ where: { id: platformVehicleId }, data: { status: "assigned" } });
        return restored;
      }
      const created = await tx.rider.create({ data: { name: body.name, phone: body.phone, email: body.email || null, password, avatar: body.avatar || "", vendorId, stateId, cityId, locationStatus: body.locationStatus || null, requestedState: body.requestedState || "", requestedCity: body.requestedCity || "", serviceZones: Array.isArray(body.serviceZones) ? body.serviceZones : [], vehicleOwnership: body.vehicleOwnership === "platform" ? "platform" : "own", vehicleType: body.vehicleType === "bicycle" ? "bicycle" : "motorbike", platformVehicleId: body.vehicleOwnership === "platform" ? platformVehicleId : null, managedBy: vendorId ? "vendor" : "admin", status: "offline", isActive: true, isVerified: Boolean(body.isVerified), approvedAt: body.isVerified ? new Date() : null, payoutDetails: body.payoutDetails || { payoutEnabled: false } }, include });
      await tx.wallet.create({ data: { ownerId: created.id, ownerModel: "Rider", balance: 0, totalEarned: 0, totalWithdrawn: 0 } });
      if (platformVehicleId) await tx.platformVehicle.update({ where: { id: platformVehicleId }, data: { status: "assigned" } });
      return created;
    });
    return shape(rider);
  },

  async listForVendor(vendorToken, filters = {}) {
    const vendorId = await resolve(prisma.vendor, vendorToken);
    if (!vendorId) return [];
    const riders = await prisma.rider.findMany({ where: { vendorId, deletedAt: null, ...(filters.status ? { status: filters.status } : {}), ...(filters.isActive !== undefined ? { isActive: filters.isActive === true || filters.isActive === "true" } : {}) }, include, orderBy: { createdAt: "desc" } });
    return riders.map(shape);
  },

  async getForVendor(riderToken, vendorToken) {
    const [riderId, vendorId] = await Promise.all([resolve(prisma.rider, riderToken), resolve(prisma.vendor, vendorToken)]);
    if (!riderId || !vendorId) return null;
    return shape(await prisma.rider.findFirst({ where: { id: riderId, vendorId, deletedAt: null }, include }));
  },

  async updateForVendor(riderToken, vendorToken, body) {
    const [riderId, vendorId] = await Promise.all([resolve(prisma.rider, riderToken), resolve(prisma.vendor, vendorToken)]);
    if (!riderId || !vendorId) return null;
    const exists = await prisma.rider.findFirst({ where: { id: riderId, vendorId }, select: { id: true, metadata: true } });
    if (!exists) return null;
    const data = {};
    for (const key of ["name", "phone", "notes", "isActive", "avatar"]) if (body[key] !== undefined) data[key] = body[key];
    if (body.metadata !== undefined) data.metadata = { ...(exists.metadata || {}), ...(body.metadata || {}) };
    return shape(await prisma.rider.update({ where: { id: riderId }, data, include }));
  },

  async updateSelf(riderToken, body) {
    const riderId = await resolve(prisma.rider, riderToken);
    if (!riderId) return null;
    const data = {};
    for (const key of ["name", "phone", "avatar"]) if (body[key] !== undefined) data[key] = body[key];
    if (body.email !== undefined) data.email = body.email || null;
    if (body.password) data.password = await bcrypt.hash(body.password, 12);
    return shape(await prisma.rider.update({ where: { id: riderId }, data, include }));
  },

  async assign(orderToken, riderToken, vendorToken) {
    const [orderId, riderId, vendorId] = await Promise.all([resolve(prisma.order, orderToken), resolve(prisma.rider, riderToken), resolve(prisma.vendor, vendorToken)]);
    if (!orderId) throw new Error("Order not found");
    if (!riderId) throw new Error("Rider not found");
    if (!vendorId) throw new Error("Vendor not found");
    const [order, rider, ownedVendorOrder] = await Promise.all([prisma.order.findUnique({ where: { id: orderId }, include: { items: true } }), prisma.rider.findUnique({ where: { id: riderId }, include }), prisma.vendorOrder.findFirst({ where: { userOrderId: orderId, restaurantId: vendorId } })]);
    if (!ownedVendorOrder) throw new Error("This order does not belong to this vendor");
    if (rider.vendorId !== vendorId || !rider.isActive || rider.deletedAt || !rider.isVerified) throw new Error("Rider is unavailable for this vendor");
    if (rider.currentOrderId && rider.currentOrderId !== orderId) throw new Error("Rider already has an active order");
    const expiry = new Date(Date.now() + 5 * 60 * 1000);
    const statusLog = Array.isArray(order.statusLog) ? order.statusLog : [];
    await prisma.$transaction([
      prisma.order.update({ where: { id: orderId }, data: { orderStatus: "rider_assigned", riderId, riderAssignment: { status: "assigned", assignedAt: new Date().toISOString(), expiresAt: expiry.toISOString(), assignedBy: "manual_assignment" }, statusLog: [...statusLog, { status: "rider_assigned", changedBy: "manual_assignment", timestamp: new Date().toISOString() }] } }),
      prisma.vendorOrder.updateMany({ where: { userOrderId: orderId }, data: { orderStatus: "rider_assigned", riderId } }),
      prisma.rider.update({ where: { id: riderId }, data: { status: "pending_assignment", currentOrderId: orderId, assignmentExpiresAt: expiry, metadata: { ...(rider.metadata || {}), legacyCurrentOrderId: legacyId(ownedVendorOrder) } } }),
      prisma.riderAssignment.create({ data: { orderId, vendorOrderId: ownedVendorOrder.id, riderId, vendorId, cityId: rider.cityId, stateId: rider.stateId, status: "pending", expiresAt: expiry, metadata: { assignedBy: "manual_assignment", assignedAt: new Date().toISOString() } } }),
    ]);
    return { order: { ...order, _id: legacyId(order), userId: order.userId, items: order.items }, rider: shape(rider) };
  },
};
