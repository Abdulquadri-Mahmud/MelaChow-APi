import prisma from "../../config/prisma.js";

const legacyId = (record) => record?.legacyMongoId || record?.id || null;

const compactObject = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined && fieldValue !== null));

const resolveId = async (model, id) => {
  if (!id) return null;
  const record = await model.findUnique({
    where: { legacyMongoId: String(id) },
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
  const assignedRider = metadata.legacyAssignedRiderId ? lookups.ridersByLegacyId?.[metadata.legacyAssignedRiderId] : null;
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
    totalEarnings: rider.totalEarnings,
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
        orderBy: { createdAt: "desc" },
      })
    ).filter((vehicle) => filterPlatformVehicle(vehicle, filters));
    const lookups = await buildPlatformVehicleLookups(vehicles);

    return {
      success: true,
      data: vehicles.map((vehicle) => platformVehicleAdminShape(vehicle, lookups)),
    };
  },
};
