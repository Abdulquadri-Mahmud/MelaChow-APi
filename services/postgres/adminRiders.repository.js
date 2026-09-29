import prisma from "../../config/prisma.js";

const legacyId = (record) => record?.legacyMongoId || record?.id || null;

const compactObject = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined && fieldValue !== null));

const mergeMetadata = (record, extra) => ({
  ...(record?.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata) ? record.metadata : {}),
  ...extra,
});

const resolveId = async (model, id) => {
  if (!id) return null;
  const token = String(id);
  const record = await model.findFirst({
    where: {
      OR: [
        ...( /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)
          ? [{ id: token }]
          : []),
        { legacyMongoId: token },
      ],
    },
    select: { id: true },
  });
  return record?.id || null;
};

const vendorShape = (vendor) =>
  vendor
    ? {
        _id: legacyId(vendor),
        storeName: vendor.storeName,
        email: vendor.email,
        phone: vendor.phone,
      }
    : null;

const stateShape = (state) =>
  state
    ? {
        _id: legacyId(state),
        name: state.name,
      }
    : null;

const cityShape = (city) =>
  city
    ? {
        _id: legacyId(city),
        name: city.name,
        stateId: city.state?.legacyMongoId || city.stateId,
      }
    : null;

const platformVehicleShape = (vehicle) =>
  vehicle
    ? {
        _id: legacyId(vehicle),
        label: vehicle.label,
        identifier: vehicle.identifier,
        vehicleType: vehicle.vehicleType,
        status: vehicle.status,
      }
    : null;

const platformVehicleAdminShape = (vehicle, lookups = {}) => {
  const metadata = vehicle.metadata || {};
  const assignedRider = vehicle.riders?.[0] || (metadata.legacyAssignedRiderId ? lookups.ridersByLegacyId?.[metadata.legacyAssignedRiderId] : null);
  const state = metadata.legacyStateId ? lookups.statesByLegacyId?.[metadata.legacyStateId] : null;
  const city = metadata.legacyCityId ? lookups.citiesByLegacyId?.[metadata.legacyCityId] : null;

  return {
    _id: legacyId(vehicle),
    label: vehicle.label,
    vehicleType: vehicle.vehicleType,
    identifier: vehicle.identifier,
    stateId: stateShape(state),
    cityId: cityShape(city),
    status: metadata.legacyStatus || vehicle.status,
    assignedRiderId: assignedRider
      ? {
          _id: legacyId(assignedRider),
          name: assignedRider.name,
          phone: assignedRider.phone,
        }
      : null,
    notes: metadata.notes || "",
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
    __v: 0,
  };
};

const vehicleInclude = {
  riders: {
    where: { deletedAt: null },
    select: { id: true, legacyMongoId: true, name: true, phone: true },
    take: 1,
  },
};

const vehicleMetadata = (body, current = {}) => ({
  ...current,
  ...(body.stateId !== undefined ? { legacyStateId: body.stateId || null } : {}),
  ...(body.cityId !== undefined ? { legacyCityId: body.cityId || null } : {}),
  ...(body.notes !== undefined ? { notes: body.notes || "" } : {}),
});

const vehicleData = (body, currentMetadata = {}) => compactObject({
  label: body.label?.trim(),
  identifier: body.identifier?.trim(),
  vehicleType: body.vehicleType,
  status: body.status === "retired" ? "inactive" : body.status,
  metadata: vehicleMetadata(body, currentMetadata),
});

const shapeOneVehicle = async (vehicle) => {
  const lookups = await buildPlatformVehicleLookups([vehicle]);
  return platformVehicleAdminShape(vehicle, lookups);
};

const riderShape = (rider) => {
  const payoutDetails = rider.payoutDetails && typeof rider.payoutDetails === "object"
    ? Object.fromEntries(Object.entries(rider.payoutDetails).filter(([key]) => key !== "recipientCode"))
    : rider.payoutDetails;
  const shaped = compactObject({
    _id: legacyId(rider),
    name: rider.name,
    phone: rider.phone,
    email: rider.email,
    avatar: rider.avatar,
    vendorId: vendorShape(rider.vendor),
    stateId: stateShape(rider.state),
    cityId: cityShape(rider.city),
    locationStatus: rider.locationStatus,
    requestedState: rider.requestedState,
    requestedCity: rider.requestedCity,
    serviceZones: rider.serviceZones,
    vehicleOwnership: rider.vehicleOwnership,
    vehicleType: rider.vehicleType,
    platformVehicleId: platformVehicleShape(rider.platformVehicle),
    managedBy: rider.managedBy,
    loginAttempts: rider.loginAttempts,
    lockUntil: rider.lockUntil,
    lastLogin: rider.lastLogin,
    status: rider.status,
    currentOrderId: rider.metadata?.legacyCurrentOrderId || rider.currentOrderId,
    assignmentExpiresAt: rider.assignmentExpiresAt,
    approvedAt: rider.approvedAt,
    approvedBy: rider.metadata?.legacyApprovedBy || rider.approvedBy,
    isActive: rider.isActive,
    isVerified: rider.isVerified,
    deletedAt: rider.deletedAt,
    totalDeliveries: rider.totalDeliveries,
    totalEarnings: Number(rider.totalEarnings || 0) / 100,
    rating: rider.rating,
    ratingCount: rider.ratingCount,
    notes: rider.notes,
    metadata:
      rider.metadata && Object.keys(rider.metadata).some((key) => !["legacyApprovedBy", "legacyCurrentOrderId"].includes(key))
        ? Object.fromEntries(Object.entries(rider.metadata).filter(([key]) => !["legacyApprovedBy", "legacyCurrentOrderId"].includes(key)))
        : undefined,
    payoutDetails,
    role: rider.role,
    createdAt: rider.createdAt,
    updatedAt: rider.updatedAt,
    isAvailable: rider.status === "available" && rider.isActive && rider.isVerified && !rider.deletedAt && !rider.currentOrderId,
    id: legacyId(rider),
    __v: 0,
  });
  return {
    ...shaped,
    vendorId: shaped.vendorId ?? null,
    platformVehicleId: shaped.platformVehicleId ?? null,
    currentOrderId: shaped.currentOrderId ?? null,
    assignmentExpiresAt: shaped.assignmentExpiresAt ?? null,
    deletedAt: shaped.deletedAt ?? null,
  };
};

const assignmentRiderShape = (rider) =>
  rider
    ? {
        _id: legacyId(rider),
        id: legacyId(rider),
        name: rider.name,
        phone: rider.phone,
        status: rider.status,
        cityId: rider.city?.legacyMongoId || rider.cityId,
        stateId: rider.state?.legacyMongoId || rider.stateId,
      }
    : null;

const assignmentVendorShape = (vendor) =>
  vendor
    ? {
        _id: legacyId(vendor),
        id: legacyId(vendor),
        storeName: vendor.storeName,
        fullAddress: [vendor.address?.street, vendor.address?.city, vendor.address?.state].filter(Boolean).join(", ").trim(),
      }
    : null;

const assignmentShape = (assignment) => {
  const metadata = assignment.metadata || {};
  const shaped = compactObject({
    _id: legacyId(assignment),
    orderId: assignment.order?.legacyMongoId || assignment.orderId,
    vendorOrderId: assignment.vendorOrder?.legacyMongoId || assignment.vendorOrderId,
    riderId: assignmentRiderShape(assignment.rider),
    vendorId: assignmentVendorShape(assignment.vendor),
    stateId: stateShape(assignment.state),
    cityId: stateShape(assignment.city),
    status: metadata.legacyStatus || assignment.status,
    assignedBy: metadata.assignedBy || null,
    assignedAt: metadata.assignedAt ? new Date(metadata.assignedAt) : assignment.createdAt,
    respondedAt: assignment.respondedAt,
    expiresAt: assignment.expiresAt,
    reason: assignment.reason || "",
    metadata: Object.fromEntries(Object.entries(metadata).filter(([key]) => !["legacyStatus", "assignedBy", "assignedAt"].includes(key))),
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    __v: 0,
  });
  return {
    ...shaped,
    assignedBy: shaped.assignedBy ?? null,
    respondedAt: shaped.respondedAt ?? null,
  };
};

const riderInclude = {
  vendor: {
    select: {
      id: true,
      legacyMongoId: true,
      storeName: true,
      email: true,
      phone: true,
    },
  },
  state: {
    select: {
      id: true,
      legacyMongoId: true,
      name: true,
    },
  },
  city: {
    select: {
      id: true,
      legacyMongoId: true,
      name: true,
      stateId: true,
      state: {
        select: {
          legacyMongoId: true,
        },
      },
    },
  },
  platformVehicle: {
    select: {
      id: true,
      legacyMongoId: true,
      label: true,
      identifier: true,
      vehicleType: true,
      status: true,
    },
  },
};

const assignmentInclude = {
  order: {
    select: {
      legacyMongoId: true,
    },
  },
  vendorOrder: {
    select: {
      legacyMongoId: true,
    },
  },
  rider: {
    select: {
      id: true,
      legacyMongoId: true,
      name: true,
      phone: true,
      status: true,
      cityId: true,
      stateId: true,
      city: {
        select: {
          legacyMongoId: true,
        },
      },
      state: {
        select: {
          legacyMongoId: true,
        },
      },
    },
  },
  vendor: {
    select: {
      id: true,
      legacyMongoId: true,
      storeName: true,
      address: true,
    },
  },
  city: {
    select: {
      id: true,
      legacyMongoId: true,
      name: true,
    },
  },
  state: {
    select: {
      id: true,
      legacyMongoId: true,
      name: true,
    },
  },
};

const buildRiderWhere = async (filters = {}) => {
  const where = { deletedAt: null };

  if (filters.status) where.status = filters.status;
  if (filters.vendorId) where.vendorId = (await resolveId(prisma.vendor, filters.vendorId)) || "__missing_vendor__";
  if (filters.managedBy) where.managedBy = filters.managedBy;
  if (filters.cityId) where.cityId = (await resolveId(prisma.city, filters.cityId)) || "__missing_city__";
  if (filters.stateId) where.stateId = (await resolveId(prisma.state, filters.stateId)) || "__missing_state__";
  if (filters.isVerified !== undefined) where.isVerified = filters.isVerified === true || filters.isVerified === "true";
  if (filters.isActive !== undefined) where.isActive = filters.isActive;

  if (filters.available === "true" || filters.available === true) {
    where.status = "available";
    where.isActive = true;
    where.isVerified = true;
    where.currentOrderId = null;
  }

  return where;
};

const mapAssignmentStatusFilter = (status) => {
  if (status === "assigned") return "pending";
  if (status === "cancelled") return "rejected";
  return status;
};

const buildAssignmentWhere = async (filters = {}) => {
  const where = {};

  if (filters.riderId) where.riderId = (await resolveId(prisma.rider, filters.riderId)) || "__missing_rider__";
  if (filters.orderId) where.orderId = (await resolveId(prisma.order, filters.orderId)) || "__missing_order__";
  if (filters.status) where.status = mapAssignmentStatusFilter(filters.status);
  if (filters.cityId) where.cityId = (await resolveId(prisma.city, filters.cityId)) || "__missing_city__";

  return where;
};

const buildPlatformVehicleLookups = async (vehicles) => {
  const stateIds = [...new Set(vehicles.map((vehicle) => vehicle.metadata?.legacyStateId).filter(Boolean))];
  const cityIds = [...new Set(vehicles.map((vehicle) => vehicle.metadata?.legacyCityId).filter(Boolean))];
  const riderIds = [...new Set(vehicles.map((vehicle) => vehicle.metadata?.legacyAssignedRiderId).filter(Boolean))];

  const [states, cities, riders] = await Promise.all([
    stateIds.length
      ? prisma.state.findMany({
          where: { legacyMongoId: { in: stateIds } },
          select: { id: true, legacyMongoId: true, name: true },
        })
      : [],
    cityIds.length
      ? prisma.city.findMany({
          where: { legacyMongoId: { in: cityIds } },
          select: {
            id: true,
            legacyMongoId: true,
            name: true,
            stateId: true,
            state: { select: { legacyMongoId: true } },
          },
        })
      : [],
    riderIds.length
      ? prisma.rider.findMany({
          where: { legacyMongoId: { in: riderIds } },
          select: { id: true, legacyMongoId: true, name: true, phone: true },
        })
      : [],
  ]);

  return {
    statesByLegacyId: Object.fromEntries(states.map((state) => [state.legacyMongoId, state])),
    citiesByLegacyId: Object.fromEntries(cities.map((city) => [city.legacyMongoId, city])),
    ridersByLegacyId: Object.fromEntries(riders.map((rider) => [rider.legacyMongoId, rider])),
  };
};

const filterPlatformVehicle = (vehicle, filters = {}) => {
  const metadata = vehicle.metadata || {};
  const status = metadata.legacyStatus || vehicle.status;

  if (filters.status && status !== filters.status) return false;
  if (filters.vehicleType && vehicle.vehicleType !== filters.vehicleType) return false;
  if (filters.cityId && metadata.legacyCityId !== String(filters.cityId)) return false;
  if (filters.available === "true" && (status !== "available" || metadata.legacyAssignedRiderId)) return false;

  return true;
};

export const adminRidersRepository = {
  async listRiders(filters = {}) {
    const riders = await prisma.rider.findMany({
      where: await buildRiderWhere(filters),
      include: riderInclude,
      orderBy: { createdAt: "asc" },
    });

    return {
      success: true,
      count: riders.length,
      data: riders.map(riderShape),
    };
  },

  async listAssignmentHistory(filters = {}) {
    const assignments = await prisma.riderAssignment.findMany({
      where: await buildAssignmentWhere(filters),
      include: assignmentInclude,
      orderBy: { createdAt: "desc" },
      take: Number(filters.limit || 100),
    });

    return {
      success: true,
      count: assignments.length,
      data: assignments.map(assignmentShape),
    };
  },

  async listPlatformVehicles(filters = {}) {
    const vehicles = (
      await prisma.platformVehicle.findMany({
        include: vehicleInclude,
        orderBy: { createdAt: "desc" },
      })
    ).filter((vehicle) => filterPlatformVehicle(vehicle, filters));
    const lookups = await buildPlatformVehicleLookups(vehicles);

    return {
      success: true,
      data: vehicles.map((vehicle) => platformVehicleAdminShape(vehicle, lookups)),
    };
  },

  async createPlatformVehicle(body) {
    const vehicle = await prisma.platformVehicle.create({
      data: vehicleData(body),
      include: vehicleInclude,
    });
    return shapeOneVehicle(vehicle);
  },

  async updatePlatformVehicle(vehicleToken, body) {
    const id = await resolveId(prisma.platformVehicle, vehicleToken);
    if (!id) return null;
    const current = await prisma.platformVehicle.findUnique({ where: { id }, select: { metadata: true } });
    const vehicle = await prisma.platformVehicle.update({
      where: { id },
      data: vehicleData(body, current?.metadata || {}),
      include: vehicleInclude,
    });
    return shapeOneVehicle(vehicle);
  },

  async deletePlatformVehicle(vehicleToken) {
    const id = await resolveId(prisma.platformVehicle, vehicleToken);
    if (!id) return false;
    await prisma.$transaction(async (tx) => {
      await tx.rider.updateMany({
        where: { platformVehicleId: id },
        data: { platformVehicleId: null, vehicleOwnership: "own" },
      });
      await tx.platformVehicle.delete({ where: { id } });
    });
    return true;
  },

  async unassignPlatformVehicle(vehicleToken) {
    const id = await resolveId(prisma.platformVehicle, vehicleToken);
    if (!id) return null;
    return prisma.$transaction(async (tx) => {
      await tx.rider.updateMany({
        where: { platformVehicleId: id },
        data: { platformVehicleId: null, vehicleOwnership: "own" },
      });
      const current = await tx.platformVehicle.findUnique({ where: { id }, select: { metadata: true } });
      const metadata = { ...(current?.metadata || {}), legacyAssignedRiderId: null, legacyStatus: "available" };
      const vehicle = await tx.platformVehicle.update({
        where: { id },
        data: { status: "available", metadata },
        include: vehicleInclude,
      });
      return platformVehicleAdminShape(vehicle);
    });
  },

  async deactivateRider(riderToken, { vendorToken = null, softDelete = false } = {}) {
    const riderId = await resolveId(prisma.rider, riderToken);
    if (!riderId) return { success: false, status: 404, message: "Rider not found" };
    const rider = await prisma.rider.findUnique({ where: { id: riderId }, include: riderInclude });
    if (vendorToken) {
      const vendorId = await resolveId(prisma.vendor, vendorToken);
      if (!vendorId || rider.vendorId !== vendorId) return { success: false, status: 404, message: "Rider not found for this vendor" };
    }
    if (softDelete && rider.currentOrderId) return { success: false, status: 409, message: "Cannot deactivate rider mid-delivery" };
    const updated = await prisma.$transaction(async (tx) => {
      if (rider.platformVehicleId) {
        const vehicle = await tx.platformVehicle.findUnique({ where: { id: rider.platformVehicleId }, select: { metadata: true } });
        await tx.platformVehicle.update({ where: { id: rider.platformVehicleId }, data: { status: "available", metadata: { ...(vehicle?.metadata || {}), legacyAssignedRiderId: null, legacyStatus: "available" } } });
      }
      return tx.rider.update({
        where: { id: riderId },
        data: { isActive: false, status: "offline", ...(softDelete ? { deletedAt: new Date(), platformVehicleId: null } : {}) },
        include: riderInclude,
      });
    });
    return { success: true, data: riderShape(updated) };
  },

  async setRiderSuspension(riderToken, { suspended, reason = "", adminToken = null }) {
    const riderId = await resolveId(prisma.rider, riderToken);
    if (!riderId) return null;
    const rider = await prisma.rider.findUnique({ where: { id: riderId }, include: riderInclude });
    const metadata = mergeMetadata(rider, {
      isSuspended: Boolean(suspended),
      suspendedUntil: null,
      lastSuspensionAction: { suspended: Boolean(suspended), reason: String(reason).trim(), changedBy: adminToken ? String(adminToken) : null, changedAt: new Date().toISOString() },
    });
    const updated = await prisma.rider.update({ where: { id: riderId }, data: { metadata, ...(suspended ? { status: "offline" } : {}) }, include: riderInclude });
    return riderShape(updated);
  },

  async approveRider(riderToken, adminToken = null) {
    const riderId = await resolveId(prisma.rider, riderToken);
    if (!riderId) return null;
    const rider = await prisma.rider.findUnique({ where: { id: riderId }, include: riderInclude });
    if (!rider.isActive || rider.deletedAt) throw new Error("Cannot approve an inactive rider");
    if (!rider.cityId || !rider.stateId) throw new Error("Assign the rider's state and city before approval");
    const adminId = adminToken ? await resolveId(prisma.admin, adminToken) : null;
    const updated = await prisma.rider.update({
      where: { id: riderId },
      data: { isVerified: true, approvedAt: rider.approvedAt || new Date(), approvedBy: adminId, locationStatus: "approved", requestedState: "", requestedCity: "" },
      include: riderInclude,
    });
    return riderShape(updated);
  },

  async forceRiderAvailable(riderToken, adminToken = null) {
    const riderId = await resolveId(prisma.rider, riderToken);
    if (!riderId) return null;
    const rider = await prisma.rider.findUnique({ where: { id: riderId }, include: riderInclude });
    if (rider.currentOrderId) {
      const [order, vendorOrder] = await Promise.all([
        prisma.order.findUnique({ where: { id: rider.currentOrderId }, select: { riderId: true } }),
        prisma.vendorOrder.findFirst({ where: { OR: [{ id: rider.currentOrderId }, { userOrderId: rider.currentOrderId }], riderId }, select: { id: true } }),
      ]);
      if (order?.riderId === riderId || vendorOrder) throw new Error("Rider still has an active assigned order. Use Unassign Rider so the order and assignment are safely reset.");
    }
    const updated = await prisma.rider.update({
      where: { id: riderId },
      data: { status: "available", currentOrderId: null, assignmentExpiresAt: null, metadata: mergeMetadata(rider, { legacyCurrentOrderId: null, lastAvailabilityOverride: { from: rider.status, to: "available", overriddenBy: adminToken ? String(adminToken) : null, overriddenAt: new Date().toISOString() } }) },
      include: riderInclude,
    });
    return riderShape(updated);
  },

  async updateRider(riderToken, body, adminToken = null) {
    const riderId = await resolveId(prisma.rider, riderToken);
    if (!riderId) return null;
    const rider = await prisma.rider.findUnique({ where: { id: riderId }, include: riderInclude });
    const [vendorId, stateId, cityId, requestedVehicleId, approvedBy] = await Promise.all([
      body.vendorId ? resolveId(prisma.vendor, body.vendorId) : Promise.resolve(body.vendorId === null || body.vendorId === "" ? null : undefined),
      body.stateId ? resolveId(prisma.state, body.stateId) : Promise.resolve(undefined),
      body.cityId ? resolveId(prisma.city, body.cityId) : Promise.resolve(undefined),
      body.platformVehicleId ? resolveId(prisma.platformVehicle, body.platformVehicleId) : Promise.resolve(undefined),
      adminToken ? resolveId(prisma.admin, adminToken) : Promise.resolve(null),
    ]);
    if (body.vendorId && !vendorId) throw new Error("Vendor not found");
    if (body.stateId && !stateId) throw new Error("State not found");
    if (body.cityId && !cityId) throw new Error("City not found");
    if (body.platformVehicleId && !requestedVehicleId) throw new Error("Platform vehicle not found");
    const changesActiveAssignmentFields =
      (body.status !== undefined && body.status !== rider.status) ||
      (body.vendorId !== undefined && (vendorId || null) !== rider.vendorId) ||
      (body.stateId !== undefined && stateId !== rider.stateId) ||
      (body.cityId !== undefined && cityId !== rider.cityId);
    if (rider.currentOrderId && changesActiveAssignmentFields) {
      const error = new Error("Cannot change rider status, vendor, or city while the rider has an active assignment");
      error.statusCode = 409;
      throw error;
    }
    const ownership = body.vehicleOwnership ?? rider.vehicleOwnership;
    const vehicleType = body.vehicleType ?? rider.vehicleType;
    const nextVehicleId = ownership === "platform" ? (requestedVehicleId ?? rider.platformVehicleId) : null;
    if (ownership === "platform") {
      if (!nextVehicleId) throw new Error("Select an available platform vehicle for this rider");
      const vehicle = await prisma.platformVehicle.findUnique({ where: { id: nextVehicleId }, include: { riders: { where: { id: { not: riderId }, deletedAt: null }, select: { id: true }, take: 1 } } });
      if (!vehicle || vehicle.vehicleType !== vehicleType || (!["available", "assigned"].includes(vehicle.status)) || vehicle.riders.length) throw new Error("Selected platform vehicle is unavailable or does not match rider vehicle type");
    }
    const scalar = {};
    for (const key of ["name", "phone", "notes", "isActive", "avatar", "status", "serviceZones", "vehicleOwnership", "vehicleType", "locationStatus", "requestedState", "requestedCity"]) if (body[key] !== undefined) scalar[key] = body[key];
    if (body.email !== undefined) scalar.email = body.email || null;
    if (body.metadata !== undefined) scalar.metadata = { ...(rider.metadata || {}), ...(body.metadata || {}) };
    if (body.payoutDetails !== undefined) scalar.payoutDetails = { ...(rider.payoutDetails || {}), ...(body.payoutDetails || {}) };
    if (body.vendorId !== undefined) { scalar.vendorId = vendorId; if (!vendorId) scalar.managedBy = "admin"; }
    if (body.stateId !== undefined) scalar.stateId = stateId;
    if (body.cityId !== undefined) scalar.cityId = cityId;
    scalar.platformVehicleId = nextVehicleId;
    if (body.stateId && body.cityId) Object.assign(scalar, { locationStatus: "approved", requestedState: "", requestedCity: "" });
    if (body.isVerified === true) Object.assign(scalar, { isVerified: true, approvedAt: rider.approvedAt || new Date(), approvedBy });
    if (body.isVerified === false) Object.assign(scalar, { isVerified: false, approvedAt: null, approvedBy: null, ...(rider.status === "available" ? { status: "offline" } : {}) });

    await prisma.$transaction(async (tx) => {
      if (rider.platformVehicleId && rider.platformVehicleId !== nextVehicleId) await tx.platformVehicle.update({ where: { id: rider.platformVehicleId }, data: { status: "available" } });
      if (nextVehicleId) await tx.platformVehicle.update({ where: { id: nextVehicleId }, data: { status: "assigned" } });
      await tx.rider.update({ where: { id: riderId }, data: scalar });
    });
    const updated = await prisma.rider.findUnique({ where: { id: riderId }, include: riderInclude });
    return riderShape(updated);
  },
};
