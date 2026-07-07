import prisma from "../../config/prisma.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const defaultPlatformConfig = {
  riderFixedPayout: 600,
};

const legacyId = (record) => record?.legacyMongoId || record?.id || null;

const compactObject = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined && fieldValue !== null));

const resolveId = async (model, id) => {
  if (!id) return null;
  if (uuidPattern.test(String(id))) return String(id);

  const record = await model.findUnique({
    where: { legacyMongoId: String(id) },
    select: { id: true },
  });

  return record?.id || null;
};

const getPlatformRiderFee = async () => {
  const config = await prisma.platformConfig.findUnique({ where: { type: "singleton" } });
  const value = config?.value && typeof config.value === "object" && !Array.isArray(config.value) ? config.value : {};
  return value.riderFixedPayout || defaultPlatformConfig.riderFixedPayout;
};

const getPlatformConfigValue = async () => {
  const config = await prisma.platformConfig.findUnique({ where: { type: "singleton" } });
  return config?.value && typeof config.value === "object" && !Array.isArray(config.value) ? config.value : {};
};

const userName = (user) =>
  user?.fullName || (user ? `${user.firstname || ""} ${user.lastname || ""}`.trim() : null) || "Customer";

const deliveryFullAddress = (address) =>
  address?.address || address?.addressLine || (address ? `${address.addressLine || ""}, ${address.cityName || address.city || ""}`.trim() : null);

const restaurantAddress = (vendor) => {
  const address = vendor?.address;
  if (!address) return "Restaurant Location";
  if (typeof address === "string") return address;
  return (
    vendor.fullAddress ||
    address.fullAddress ||
    address.street ||
    `${address.street || address.addressLine || ""}, ${address.city || ""}, ${address.state || ""}`
      .replace(/^[ ,]+|[ ,]+$/g, "")
      .replace(/, ,/g, ",") ||
    "Restaurant Location"
  );
};

const dietaryShape = (value) => (value === "non_veg" ? "non-veg" : value);

const orderItemShape = (item, { populateRestaurant = false } = {}) => ({
  _id: legacyId(item),
  type: item.type,
  foodId: item.menuItem?.legacyMongoId || item.foodId,
  portionId: item.portion?.legacyMongoId || item.portionId,
  variantId: item.comboItem?.legacyMongoId || item.variantId,
  restaurantId: populateRestaurant && item.restaurant
    ? compactObject({
        _id: legacyId(item.restaurant),
        storeName: item.restaurant.storeName,
        logo: item.restaurant.logo,
      })
    : item.restaurant?.legacyMongoId || item.restaurantId,
  storeName: item.storeName,
  variant: item.variant,
  name: item.name,
  image_url: item.imageUrl,
  portion_label: item.portionLabel,
  quantity: item.quantity,
  portion_quantity: item.portionQuantity,
  price: item.price,
  note: item.note,
  dietary_type: dietaryShape(item.dietaryType),
  item_type: item.itemType,
  selected_options: item.selectedOptions,
  metadata: item.metadata,
});

const vendorDeliveryFeeShape = (fee) => ({
  restaurantId: fee.restaurant?.legacyMongoId || fee.restaurantId,
  deliveryFee: fee.deliveryFee,
});

const riderPublicShape = (rider) => {
  const safePayoutDetails = rider.payoutDetails && typeof rider.payoutDetails === "object"
    ? Object.fromEntries(Object.entries(rider.payoutDetails).filter(([key]) => key !== "recipientCode"))
    : rider.payoutDetails;

  return compactObject({
    _id: legacyId(rider),
    name: rider.name,
    phone: rider.phone,
    email: rider.email,
    avatar: rider.avatar,
    vendorId: rider.vendor?.legacyMongoId || rider.vendorId,
    stateId: rider.state?.legacyMongoId || rider.stateId,
    cityId: rider.city?.legacyMongoId || rider.cityId,
    locationStatus: rider.locationStatus,
    requestedState: rider.requestedState,
    requestedCity: rider.requestedCity,
    serviceZones: rider.serviceZones,
    vehicleOwnership: rider.vehicleOwnership,
    vehicleType: rider.vehicleType,
    platformVehicleId: rider.platformVehicle?.legacyMongoId || rider.platformVehicleId,
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
    metadata: rider.metadata,
    payoutDetails: safePayoutDetails,
    role: rider.role,
    createdAt: rider.createdAt,
    updatedAt: rider.updatedAt,
    isAvailable: rider.status === "available" && rider.isActive && rider.isVerified && !rider.deletedAt && !rider.currentOrderId,
    id: legacyId(rider),
    __v: 0,
  });
};

const restaurantShape = (vendor) =>
  vendor
    ? compactObject({
        _id: legacyId(vendor),
        id: legacyId(vendor),
        storeName: vendor.storeName,
        address: vendor.address,
        phone: vendor.phone,
        location: vendor.location,
        coords: vendor.coords,
        logo: vendor.logo,
        cityId: vendor.city?.legacyMongoId || vendor.cityId,
        stateId: vendor.state?.legacyMongoId || vendor.stateId,
        fullAddress: vendor.fullAddress || restaurantAddress(vendor),
      })
    : null;

const baseOrderShape = (order, options = {}) => ({
  _id: legacyId(order),
  userId: order.user?.legacyMongoId || order.userId,
  items: (order.items || []).map((item) => orderItemShape(item, options)),
  vendorDeliveryFees: (order.vendorDeliveryFees || []).map(vendorDeliveryFeeShape),
  deliveryAddress: order.deliveryAddress,
  phone: order.phone,
  subtotal: order.subtotal,
  deliveryFee: order.deliveryFee,
  serviceFee: order.serviceFee,
  appliedDiscount: order.appliedDiscount,
  freeDeliveryPromo: order.freeDeliveryPromo,
  vendorDeliveryPromo: order.vendorDeliveryPromo,
  total: order.total,
  orderId: order.orderCode,
  paymentStatus: order.paymentStatus,
  paymentReference: order.paymentReference,
  idempotencyKey: order.idempotencyKey,
  orderStatus: order.orderStatus,
  riderId: order.rider?.legacyMongoId || order.riderId,
  riderAssignment: order.riderAssignment,
  riderEarnings: order.riderEarnings,
  statusLog: order.statusLog,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  __v: 0,
});

const orderInclude = {
  user: {
    select: {
      id: true,
      legacyMongoId: true,
      fullName: true,
      firstname: true,
      lastname: true,
      phone: true,
      email: true,
    },
  },
  rider: {
    select: {
      id: true,
      legacyMongoId: true,
    },
  },
  items: {
    include: {
      menuItem: { select: { id: true, legacyMongoId: true } },
      portion: { select: { id: true, legacyMongoId: true } },
      comboItem: { select: { id: true, legacyMongoId: true } },
      restaurant: { select: { id: true, legacyMongoId: true, storeName: true, logo: true } },
    },
  },
  vendorDeliveryFees: {
    include: {
      restaurant: { select: { id: true, legacyMongoId: true } },
    },
  },
};

const vendorInclude = {
  city: { select: { id: true, legacyMongoId: true } },
  state: { select: { id: true, legacyMongoId: true } },
};

const activeOrderShape = async ({ order, vendorOrder = null, restaurant }) => {
  const platformRiderFee = await getPlatformRiderFee();
  const shaped = baseOrderShape(order);
  shaped.status = vendorOrder ? vendorOrder.orderStatus : order.orderStatus;
  shaped.restaurantId = restaurantShape(restaurant);
  shaped.restaurantName = restaurant?.storeName || "Partner Merchant";
  shaped.restaurantLogo = restaurant?.logo || null;
  shaped.userName = userName(order.user);
  shaped.userPhone = order.user?.phone || order.phone || null;
  shaped.deliveryFullAddress = deliveryFullAddress(order.deliveryAddress);
  shaped.deliveryFee = platformRiderFee;

  if (vendorOrder) {
    shaped.items = vendorOrder.items || [];
    shaped._id = legacyId(vendorOrder);
    shaped.vendorOrderId = legacyId(vendorOrder);
  }

  return shaped;
};

const detailOrderShape = async ({ order, vendorOrder = null, restaurant }) => {
  const platformRiderFee = await getPlatformRiderFee();
  const shaped = await activeOrderShape({ order, vendorOrder, restaurant });
  delete shaped.restaurantLogo;
  delete shaped.status;
  shaped.riderEarnings = platformRiderFee;
  shaped.deliveryFee = platformRiderFee;
  shaped.restaurantAddress = restaurantAddress(restaurant);
  return shaped;
};

const orderHistoryShape = (order) => {
  const shaped = baseOrderShape(order, { populateRestaurant: true });
  if (["delivered", "completed"].includes(order.orderStatus)) shaped.status = "delivered";
  else if (order.orderStatus === "out_for_delivery") shaped.status = "picked_up";
  else if (order.orderStatus === "rider_assigned") shaped.status = "assigned";
  else shaped.status = order.orderStatus;
  return shaped;
};

const getOrderRestaurant = async (order, vendorOrder = null) => {
  const restaurantId = vendorOrder?.restaurantId || order.items?.[0]?.restaurantId || null;
  if (!restaurantId) return null;
  return prisma.vendor.findUnique({
    where: { id: restaurantId },
    include: vendorInclude,
  });
};

const findOrderByAnyId = async (orderId) => {
  const vendorOrder = await prisma.vendorOrder.findFirst({
    where: uuidPattern.test(String(orderId)) ? { id: orderId } : { legacyMongoId: String(orderId) },
    include: {
      userOrder: { include: orderInclude },
      restaurant: { include: vendorInclude },
    },
  });

  if (vendorOrder) return { vendorOrder, order: vendorOrder.userOrder, restaurant: vendorOrder.restaurant };

  const order = await prisma.order.findFirst({
    where: uuidPattern.test(String(orderId)) ? { id: orderId } : { legacyMongoId: String(orderId) },
    include: orderInclude,
  });

  if (!order) return null;
  return { order, vendorOrder: null, restaurant: await getOrderRestaurant(order) };
};

const riderInclude = {
  vendor: { select: { id: true, legacyMongoId: true } },
  state: { select: { id: true, legacyMongoId: true } },
  city: { select: { id: true, legacyMongoId: true } },
  platformVehicle: { select: { id: true, legacyMongoId: true } },
};

const mergeMetadata = (rider, extra) => ({
  ...(rider?.metadata && typeof rider.metadata === "object" && !Array.isArray(rider.metadata) ? rider.metadata : {}),
  ...extra,
});

export const riderSelfRepository = {
  async acceptAssignment(riderId, requestedOrderId = null) {
    const resolvedRiderId = await resolveId(prisma.rider, riderId);
    if (!resolvedRiderId) return { success: false, status: 404, message: "Rider not found" };

    const rider = await prisma.rider.findUnique({
      where: { id: resolvedRiderId },
      include: riderInclude,
    });
    if (!rider) return { success: false, status: 404, message: "Rider not found" };

    if (rider.status === "on_delivery" || rider.currentOrderId) {
      const sameOrder = requestedOrderId && rider.metadata?.legacyCurrentOrderId === String(requestedOrderId);
      if (!sameOrder) {
        return {
          success: false,
          status: 400,
          message: "You already have an ongoing delivery. Please complete your current active delivery before accepting a new job.",
        };
      }
    }

    let found = requestedOrderId ? await findOrderByAnyId(requestedOrderId) : null;
    let assignment = null;

    if (found?.order) {
      assignment = await prisma.riderAssignment.findFirst({
        where: {
          riderId: resolvedRiderId,
          orderId: found.order.id,
          ...(found.vendorOrder ? { vendorOrderId: found.vendorOrder.id } : {}),
          status: "pending",
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    if (!assignment) {
      assignment = await prisma.riderAssignment.findFirst({
        where: {
          riderId: resolvedRiderId,
          status: "pending",
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        include: {
          vendorOrder: {
            include: {
              userOrder: { include: orderInclude },
              restaurant: { include: vendorInclude },
            },
          },
          order: { include: orderInclude },
        },
      });

      if (assignment) {
        if (assignment.vendorOrder?.userOrder) {
          found = { vendorOrder: assignment.vendorOrder, order: assignment.vendorOrder.userOrder, restaurant: assignment.vendorOrder.restaurant };
        } else {
          found = { order: assignment.order, vendorOrder: null, restaurant: await getOrderRestaurant(assignment.order) };
        }
      }
    }

    if (!found?.order || !assignment) return { success: false, status: 400, message: "No active assignment found to accept." };

    if (found.order.riderId && found.order.riderId !== resolvedRiderId) {
      const updatedRider = await prisma.rider.update({
        where: { id: resolvedRiderId },
        data: { status: "available", currentOrderId: null, assignmentExpiresAt: null },
        include: riderInclude,
      });
      await prisma.riderAssignment.update({
        where: { id: assignment.id },
        data: { status: "rejected", respondedAt: new Date(), reason: "order_already_taken" },
      });
      return { success: false, status: 409, message: "This order has already been accepted by another rider", data: riderPublicShape(updatedRider) };
    }

    const statusLog = Array.isArray(found.order.statusLog) ? found.order.statusLog : [];
    const riderAssignment =
      found.order.riderAssignment && typeof found.order.riderAssignment === "object" && !Array.isArray(found.order.riderAssignment)
        ? found.order.riderAssignment
        : {};
    const currentOrderLegacyId = found.vendorOrder ? legacyId(found.vendorOrder) : legacyId(found.order);

    const losingAssignments = await prisma.riderAssignment.findMany({
      where: {
        ...(found.vendorOrder ? { vendorOrderId: found.vendorOrder.id } : { orderId: found.order.id }),
        riderId: { not: resolvedRiderId },
        status: "pending",
      },
      select: { id: true, riderId: true, rider: { select: { id: true, legacyMongoId: true } } },
    });
    const losingRiderIds = losingAssignments.map((entry) => entry.riderId).filter(Boolean);

    const [, , , , updatedRider] = await prisma.$transaction([
      prisma.order.update({
        where: { id: found.order.id },
        data: {
          riderId: resolvedRiderId,
          riderAssignment: {
            ...riderAssignment,
            status: "accepted",
            acceptedAt: new Date().toISOString(),
            lastReason: "",
          },
          statusLog: [
            ...statusLog,
            {
              status: "rider_accepted",
              changedBy: "rider",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      }),
      found.vendorOrder
        ? prisma.vendorOrder.update({
            where: { id: found.vendorOrder.id },
            data: { riderId: resolvedRiderId, orderStatus: "rider_assigned" },
          })
        : prisma.vendorOrder.updateMany({
            where: { userOrderId: found.order.id },
            data: { riderId: resolvedRiderId, orderStatus: "rider_assigned" },
          }),
      prisma.riderAssignment.update({
        where: { id: assignment.id },
        data: { status: "accepted", respondedAt: new Date() },
      }),
      prisma.riderAssignment.updateMany({
        where: { id: { in: losingAssignments.map((entry) => entry.id) } },
        data: { status: "rejected", respondedAt: new Date(), reason: "accepted_by_another_rider" },
      }),
      prisma.rider.update({
        where: { id: resolvedRiderId },
        data: {
          status: "on_delivery",
          currentOrderId: found.order.id,
          assignmentExpiresAt: null,
          metadata: mergeMetadata(rider, { legacyCurrentOrderId: currentOrderLegacyId }),
        },
        include: riderInclude,
      }),
      ...(losingRiderIds.length
        ? [
            prisma.rider.updateMany({
              where: { id: { in: losingRiderIds }, status: "pending_assignment" },
              data: { status: "available", assignmentExpiresAt: null, currentOrderId: null },
            }),
          ]
        : []),
    ]);

    // ── Queue 1-hour delivery watchdog (Postgres Path) ─────────────────
    try {
        const { deliveryWatchdogQueue } = await import("../../config/queue.js");
        const { DELIVERY_TIMEOUT_MS } = await import("../../config/payouts.js");
        const legacyRiderId = rider.legacyMongoId || rider.id.toString();
        const legacyOrderId = found.order.legacyMongoId || found.order.id.toString();
        const legacyVendorOrderId = found.vendorOrder
          ? (found.vendorOrder.legacyMongoId || found.vendorOrder.id.toString())
          : legacyOrderId;

        await deliveryWatchdogQueue.add(
            "delivery-timeout",
            {
                orderId:       legacyOrderId,
                vendorOrderId: legacyVendorOrderId,
                riderId:       legacyRiderId,
            },
            {
                jobId:            `watchdog:${legacyVendorOrderId}`,
                delay:            DELIVERY_TIMEOUT_MS,
                attempts:         2,
                backoff:          { type: "fixed", delay: 30_000 },
                removeOnComplete: true,
                removeOnFail:     false,
            }
        );
    } catch (wErr) {
        console.error("⚠️ Watchdog queue failed in Postgres path (non-fatal):", wErr.message);
    }

    return {
      success: true,
      data: riderPublicShape(updatedRider),
      notificationContext: {
        orderId: found.order.orderCode || currentOrderLegacyId,
        orderDatabaseId: currentOrderLegacyId,
        vendorId: found.vendorOrder?.restaurant?.legacyMongoId || found.vendorOrder?.restaurantId || found.order.items?.[0]?.restaurant?.legacyMongoId || found.order.items?.[0]?.restaurantId,
        riderName: updatedRider.name,
        losingRiderIds: losingAssignments.map((entry) => entry.rider?.legacyMongoId || entry.riderId),
      },
    };
  },

  async rejectAssignment(riderId, { orderId = null, reason = null, changedBy = "rider" } = {}) {
    const resolvedRiderId = await resolveId(prisma.rider, riderId);
    if (!resolvedRiderId) return { success: false, status: 404, message: "Rider not found" };

    const rider = await prisma.rider.findUnique({
      where: { id: resolvedRiderId },
      include: riderInclude,
    });
    if (!rider) return { success: false, status: 404, message: "Rider not found" };

    const found = orderId ? await findOrderByAnyId(orderId) : null;
    const activeAssignments = await prisma.riderAssignment.findMany({
      where: {
        riderId: resolvedRiderId,
        status: "pending",
        expiresAt: { gt: new Date() },
        ...(found?.order ? { orderId: found.order.id } : {}),
        ...(found?.vendorOrder ? { vendorOrderId: found.vendorOrder.id } : {}),
      },
      include: {
        vendorOrder: {
          include: {
            userOrder: { include: orderInclude },
            restaurant: { include: vendorInclude },
          },
        },
        order: { include: orderInclude },
      },
    });

    if (!activeAssignments.length) {
      const updatedRider = await prisma.rider.update({
        where: { id: resolvedRiderId },
        data: { status: "available", currentOrderId: null, assignmentExpiresAt: null },
        include: riderInclude,
      });
      return {
        success: false,
        status: 400,
        message: "No active assignment found for this rider, marked as available",
        data: riderPublicShape(updatedRider),
      };
    }

    const isTimeout = reason === "timeout";
    const finalReason = changedBy === "admin" ? reason || "rejected_by_admin" : isTimeout ? "timeout" : "rejected";
    const actionStatus = isTimeout ? "rider_assignment_timeout" : "rider_rejected";
    const orderUpdates = [];
    const notificationOrders = [];

    for (const assignment of activeAssignments) {
      const assignmentOrder = assignment.vendorOrder?.userOrder || assignment.order;
      if (!assignmentOrder) continue;

      const remainingOffers = await prisma.riderAssignment.count({
        where: {
          orderId: assignmentOrder.id,
          ...(assignment.vendorOrderId ? { vendorOrderId: assignment.vendorOrderId } : {}),
          status: "pending",
          expiresAt: { gt: new Date() },
          id: { not: assignment.id },
        },
      });

      if (remainingOffers === 0) {
        const statusLog = Array.isArray(assignmentOrder.statusLog) ? assignmentOrder.statusLog : [];
        const riderAssignment =
          assignmentOrder.riderAssignment && typeof assignmentOrder.riderAssignment === "object" && !Array.isArray(assignmentOrder.riderAssignment)
            ? assignmentOrder.riderAssignment
            : {};
        orderUpdates.push(
          prisma.order.update({
            where: { id: assignmentOrder.id },
            data: {
              orderStatus: "ready_for_pickup",
              riderId: null,
              riderAssignment: {
                ...riderAssignment,
                status: isTimeout ? "timeout" : "rejected",
                acceptedAt: null,
                rejectedAt: new Date().toISOString(),
                expiresAt: null,
                lastReason: finalReason,
              },
              statusLog: [
                ...statusLog,
                {
                  status: actionStatus,
                  changedBy,
                  timestamp: new Date().toISOString(),
                },
              ],
            },
          })
        );
        orderUpdates.push(
          assignment.vendorOrderId
            ? prisma.vendorOrder.update({
                where: { id: assignment.vendorOrderId },
                data: { orderStatus: "ready_for_pickup", riderId: null },
              })
            : prisma.vendorOrder.updateMany({
                where: { userOrderId: assignmentOrder.id },
                data: { orderStatus: "ready_for_pickup", riderId: null },
              })
        );
      }

      notificationOrders.push({
        orderId: assignmentOrder.orderCode || legacyId(assignmentOrder),
        orderDatabaseId: assignment.vendorOrder?.legacyMongoId || assignmentOrder.legacyMongoId || assignmentOrder.id,
        remainingOffers,
        vendorId:
          assignment.vendorOrder?.restaurant?.legacyMongoId ||
          assignment.vendorOrder?.restaurantId ||
          assignmentOrder.items?.[0]?.restaurant?.legacyMongoId ||
          assignmentOrder.items?.[0]?.restaurantId,
      });
    }

    const [, updatedRider] = await prisma.$transaction([
      prisma.riderAssignment.updateMany({
        where: { id: { in: activeAssignments.map((assignment) => assignment.id) } },
        data: { status: isTimeout ? "timeout" : "rejected", respondedAt: new Date(), reason: finalReason },
      }),
      prisma.rider.update({
        where: { id: resolvedRiderId },
        data: { status: "available", currentOrderId: null, assignmentExpiresAt: null },
        include: riderInclude,
      }),
      ...orderUpdates,
    ]);

    return {
      success: true,
      data: riderPublicShape(updatedRider),
      notificationContext: {
        riderName: updatedRider.name,
        riderId: legacyId(updatedRider),
        reason: finalReason,
        actionStatus,
        orders: notificationOrders,
      },
    };
  },

  async markPickedUp(orderId, riderId) {
    const resolvedRiderId = await resolveId(prisma.rider, riderId);
    if (!resolvedRiderId) throw new Error("Rider not found");

    const rider = await prisma.rider.findUnique({
      where: { id: resolvedRiderId },
      select: { id: true },
    });
    if (!rider) throw new Error("Rider not found");

    const found = await findOrderByAnyId(orderId);
    if (!found?.order) throw new Error("Order not found");

    const assignedOwner = found.order.riderId === resolvedRiderId || found.vendorOrder?.riderId === resolvedRiderId;
    if (!assignedOwner) throw new Error("Rider not assigned to this order");

    const statusLog = Array.isArray(found.order.statusLog) ? found.order.statusLog : [];
    const riderAssignment =
      found.order.riderAssignment && typeof found.order.riderAssignment === "object" && !Array.isArray(found.order.riderAssignment)
        ? found.order.riderAssignment
        : {};

    const assignmentWhere = found.vendorOrder
      ? { riderId: resolvedRiderId, vendorOrderId: found.vendorOrder.id, status: { in: ["pending", "accepted"] } }
      : { riderId: resolvedRiderId, orderId: found.order.id, status: { in: ["pending", "accepted"] } };

    const [, , , updatedOrder] = await prisma.$transaction([
      found.vendorOrder
        ? prisma.vendorOrder.update({
            where: { id: found.vendorOrder.id },
            data: { orderStatus: "out_for_delivery" },
          })
        : prisma.vendorOrder.updateMany({
            where: { userOrderId: found.order.id },
            data: { orderStatus: "out_for_delivery" },
          }),
      prisma.rider.update({
        where: { id: resolvedRiderId },
        data: { status: "on_delivery" },
      }),
      prisma.riderAssignment.updateMany({
        where: assignmentWhere,
        data: { status: "picked_up", respondedAt: new Date() },
      }),
      prisma.order.update({
        where: { id: found.order.id },
        data: {
          orderStatus: "out_for_delivery",
          riderAssignment: {
            ...riderAssignment,
            status: "picked_up",
            lastReason: "",
          },
          statusLog: [
            ...statusLog,
            {
              status: "out_for_delivery",
              changedBy: "rider",
              timestamp: new Date().toISOString(),
            },
          ],
        },
        include: orderInclude,
      }),
    ]);

    return baseOrderShape(updatedOrder);
  },

  async markDelivered(orderId, riderId) {
    const resolvedRiderId = await resolveId(prisma.rider, riderId);
    if (!resolvedRiderId) throw new Error("Rider not found");

    const rider = await prisma.rider.findUnique({
      where: { id: resolvedRiderId },
      include: riderInclude,
    });
    if (!rider) throw new Error("Rider not found");

    const found = await findOrderByAnyId(orderId);
    if (!found?.order) throw new Error("Order not found");

    const assignedOwner = found.order.riderId === resolvedRiderId || found.vendorOrder?.riderId === resolvedRiderId;
    if (!assignedOwner) throw new Error("Rider not assigned to this order");

    if (["delivered", "completed"].includes(found.order.orderStatus)) {
      return {
        order: baseOrderShape(found.order),
        payoutCredited: false,
        isVendorManagedDelivery: rider.managedBy !== "admin",
        alreadyDelivered: true,
      };
    }

    const platformConfig = await getPlatformConfigValue();
    const riderFixedPayout = platformConfig.riderFixedPayout || defaultPlatformConfig.riderFixedPayout;
    const riderVendorId = rider.vendorId;
    const isVendorManagedDelivery = rider.managedBy !== "admin";

    let deliveryFee = 0;
    if (rider.managedBy === "admin") {
      deliveryFee = riderFixedPayout;
    } else {
      const deliveryFeeEntry = (found.order.vendorDeliveryFees || []).find((fee) => fee.restaurantId === riderVendorId);
      deliveryFee = Number(deliveryFeeEntry?.deliveryFee || 0);
      if (deliveryFee === 0) {
        const vendorPromo = found.order.vendorDeliveryPromo || {};
        const freeDeliveryPromo = found.order.freeDeliveryPromo || {};
        if (vendorPromo?.applied && vendorPromo.vendorId === riderVendorId) {
          deliveryFee = Number(vendorPromo.originalDeliveryFee || 0);
        } else if (freeDeliveryPromo?.eligible) {
          deliveryFee = Number(freeDeliveryPromo.originalDeliveryFee || 0);
        }
      }
    }

    const riderPayout = deliveryFee > 0 ? Math.min(riderFixedPayout, deliveryFee) : 0;
    const platformSpread = deliveryFee > 0 ? Number((deliveryFee - riderPayout).toFixed(2)) : 0;
    const statusLog = Array.isArray(found.order.statusLog) ? found.order.statusLog : [];
    const riderAssignment =
      found.order.riderAssignment && typeof found.order.riderAssignment === "object" && !Array.isArray(found.order.riderAssignment)
        ? found.order.riderAssignment
        : {};

    const activeVendorOrders = await prisma.vendorOrder.findMany({
      where: {
        riderId: resolvedRiderId,
        orderStatus: { in: ["accepted", "out_for_delivery", "rider_assigned"] },
        id: { not: found.vendorOrder?.id || "00000000-0000-0000-0000-000000000000" },
        NOT: { userOrderId: found.order.id },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, legacyMongoId: true, userOrderId: true },
    });
    const activeMasterOrders = await prisma.order.findMany({
      where: {
        riderId: resolvedRiderId,
        orderStatus: { in: ["accepted", "out_for_delivery", "rider_assigned"] },
        id: { not: found.order.id },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, legacyMongoId: true },
    });
    const nextActiveOrder = activeVendorOrders[0] || activeMasterOrders[0] || null;
    const nextCurrentOrderId = activeVendorOrders[0]?.userOrderId || activeMasterOrders[0]?.id || null;
    const nextLegacyCurrentOrderId = nextActiveOrder ? legacyId(nextActiveOrder) : null;

    const adminWallet = await prisma.wallet.findFirst({ where: { ownerModel: "Admin" }, orderBy: { createdAt: "asc" } });
    const canCreditRiderPayout = Boolean(adminWallet && riderPayout > 0 && adminWallet.balance >= riderPayout);
    const vendorOrdersForEscrow = await prisma.vendorOrder.findMany({
      where: { userOrderId: found.order.id },
      include: { restaurant: { select: { id: true, legacyMongoId: true, storeName: true } } },
    });

    let remainingAdminBalance = adminWallet?.balance || 0;
    if (canCreditRiderPayout) remainingAdminBalance -= riderPayout;

    const escrowReleases = [];
    for (const vendorOrder of vendorOrdersForEscrow) {
      if (vendorOrder.escrowReleased) continue;
      const escrowAmount = Number(vendorOrder.escrowAmount || 0);
      if (escrowAmount <= 0) {
        escrowReleases.push({ vendorOrder, amount: 0, canRelease: true });
        continue;
      }
      const canRelease = Boolean(adminWallet && remainingAdminBalance >= escrowAmount);
      escrowReleases.push({ vendorOrder, amount: escrowAmount, canRelease });
      if (canRelease) remainingAdminBalance -= escrowAmount;
    }

    let riderWallet = await prisma.wallet.findUnique({
      where: { ownerId_ownerModel: { ownerId: resolvedRiderId, ownerModel: "Rider" } },
    });
    if (canCreditRiderPayout && !riderWallet) {
      riderWallet = await prisma.wallet.create({
        data: {
          ownerId: resolvedRiderId,
          ownerModel: "Rider",
          balance: 0,
          totalEarned: 0,
        },
      });
    }

    const vendorWallets = new Map();
    for (const release of escrowReleases) {
      if (!release.canRelease || release.amount <= 0) continue;
      let wallet = await prisma.wallet.findUnique({
        where: { ownerId_ownerModel: { ownerId: release.vendorOrder.restaurantId, ownerModel: "Vendor" } },
      });
      if (!wallet) {
        wallet = await prisma.wallet.create({
          data: {
            ownerId: release.vendorOrder.restaurantId,
            ownerModel: "Vendor",
            balance: 0,
            totalEarned: 0,
          },
        });
      }
      vendorWallets.set(release.vendorOrder.restaurantId, wallet);
    }

    const assignmentWhere = found.vendorOrder
      ? { riderId: resolvedRiderId, vendorOrderId: found.vendorOrder.id, status: { in: ["accepted", "picked_up"] } }
      : { riderId: resolvedRiderId, orderId: found.order.id, status: { in: ["accepted", "picked_up"] } };

    const transactionOps = [
      prisma.order.update({
        where: { id: found.order.id },
        data: {
          orderStatus: "delivered",
          riderAssignment: {
            ...riderAssignment,
            status: "delivered",
            lastReason: "",
          },
          riderEarnings: riderPayout,
          statusLog: [
            ...statusLog,
            {
              status: "delivered",
              changedBy: "rider",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      }),
      found.vendorOrder
        ? prisma.vendorOrder.update({
            where: { id: found.vendorOrder.id },
            data: { orderStatus: "delivered" },
          })
        : prisma.vendorOrder.updateMany({
            where: { userOrderId: found.order.id },
            data: { orderStatus: "delivered" },
          }),
      prisma.riderAssignment.updateMany({
        where: assignmentWhere,
        data: { status: "delivered", respondedAt: new Date() },
      }),
      prisma.rider.update({
        where: { id: resolvedRiderId },
        data: {
          status: nextCurrentOrderId ? "on_delivery" : "available",
          currentOrderId: nextCurrentOrderId,
          assignmentExpiresAt: null,
          totalDeliveries: { increment: 1 },
          totalEarnings: { increment: riderPayout },
          metadata: nextLegacyCurrentOrderId
            ? mergeMetadata(rider, { legacyCurrentOrderId: nextLegacyCurrentOrderId })
            : mergeMetadata(rider, { legacyCurrentOrderId: null }),
        },
      }),
    ];

    if (canCreditRiderPayout) {
      transactionOps.push(
        prisma.wallet.update({
          where: { id: adminWallet.id },
          data: { balance: { decrement: riderPayout } },
        }),
        prisma.walletTransaction.create({
          data: {
            walletId: adminWallet.id,
            type: "debit",
            amount: riderPayout,
            description: `Rider payout for Order ${found.order.orderCode}`,
            transactionType: "rider_payout",
            orderId: found.order.id,
            metadata: { legacyOrderId: legacyId(found.order), riderId: legacyId(rider) },
          },
        }),
        prisma.walletTransaction.create({
          data: {
            walletId: adminWallet.id,
            type: "debit",
            amount: 0,
            reportingAmount: platformSpread,
            description: `Delivery spread for Order ${found.order.orderCode}`,
            transactionType: "delivery_spread",
            orderId: found.order.id,
            metadata: { legacyOrderId: legacyId(found.order), riderId: legacyId(rider) },
          },
        }),
        prisma.wallet.update({
          where: { id: riderWallet.id },
          data: { balance: { increment: riderPayout }, totalEarned: { increment: riderPayout } },
        }),
        prisma.walletTransaction.create({
          data: {
            walletId: riderWallet.id,
            type: "credit",
            amount: riderPayout,
            description: `Delivery payout for Order ${found.order.orderCode}`,
            transactionType: "rider_payout",
            orderId: found.order.id,
            metadata: { legacyOrderId: legacyId(found.order) },
          },
        })
      );
    }

    for (const release of escrowReleases) {
      if (!release.canRelease) continue;
      if (release.amount <= 0) {
        transactionOps.push(prisma.vendorOrder.update({ where: { id: release.vendorOrder.id }, data: { escrowReleased: true } }));
        continue;
      }
      const vendorWallet = vendorWallets.get(release.vendorOrder.restaurantId);
      transactionOps.push(
        prisma.wallet.update({
          where: { id: adminWallet.id },
          data: { balance: { decrement: release.amount } },
        }),
        prisma.walletTransaction.create({
          data: {
            walletId: adminWallet.id,
            type: "debit",
            amount: release.amount,
            description: `Escrow release to vendor for VendorOrder ${legacyId(release.vendorOrder)}`,
            transactionType: "escrow_release",
            orderId: found.order.id,
            metadata: { legacyOrderId: legacyId(found.order), legacyVendorOrderId: legacyId(release.vendorOrder) },
          },
        }),
        prisma.wallet.update({
          where: { id: vendorWallet.id },
          data: { balance: { increment: release.amount }, totalEarned: { increment: release.amount } },
        }),
        prisma.walletTransaction.create({
          data: {
            walletId: vendorWallet.id,
            type: "credit",
            amount: release.amount,
            description: `Food revenue released from escrow for VendorOrder ${legacyId(release.vendorOrder)}`,
            transactionType: "escrow_release",
            orderId: found.order.id,
            metadata: { legacyOrderId: legacyId(found.order), legacyVendorOrderId: legacyId(release.vendorOrder) },
          },
        }),
        prisma.vendorOrder.update({ where: { id: release.vendorOrder.id }, data: { escrowReleased: true } })
      );
    }

    await prisma.$transaction(transactionOps);

    const completedOrder = await prisma.order.findUnique({
      where: { id: found.order.id },
      include: orderInclude,
    });

    return {
      order: baseOrderShape(completedOrder),
      payoutCredited: canCreditRiderPayout,
      isVendorManagedDelivery,
      payout: riderPayout,
      payoutBlockedReason: riderPayout > 0 && !canCreditRiderPayout ? "admin_wallet_insufficient_or_missing" : null,
      escrowReleaseFailures: escrowReleases
        .filter((release) => !release.canRelease)
        .map((release) => ({
          vendorOrderId: legacyId(release.vendorOrder),
          amount: release.amount,
          reason: "admin_wallet_insufficient_or_missing",
        })),
    };
  },

  async getActiveOrder(riderId) {
    const resolvedRiderId = await resolveId(prisma.rider, riderId);
    if (!resolvedRiderId) return null;

    const rider = await prisma.rider.findUnique({
      where: { id: resolvedRiderId },
      select: { id: true, status: true, currentOrderId: true, metadata: true },
    });
    if (!rider?.currentOrderId && !rider?.metadata?.legacyCurrentOrderId) return null;

    let vendorOrder = null;
    if (rider.metadata?.legacyCurrentOrderId) {
      vendorOrder = await prisma.vendorOrder.findUnique({
        where: { legacyMongoId: String(rider.metadata.legacyCurrentOrderId) },
        include: {
          userOrder: { include: orderInclude },
          restaurant: { include: vendorInclude },
        },
      });
    }

    if (vendorOrder) {
      return activeOrderShape({
        order: vendorOrder.userOrder,
        vendorOrder,
        restaurant: vendorOrder.restaurant,
      });
    }

    const order = rider.currentOrderId
      ? await prisma.order.findUnique({ where: { id: rider.currentOrderId }, include: orderInclude })
      : null;
    if (!order) return null;

    const shaped = await activeOrderShape({ order, restaurant: await getOrderRestaurant(order) });
    if (rider.status === "pending_assignment") shaped.status = "assigned";
    return shaped;
  },

  async getPendingOffers(riderId) {
    const resolvedRiderId = await resolveId(prisma.rider, riderId);
    if (!resolvedRiderId) return [];

    const assignments = await prisma.riderAssignment.findMany({
      where: {
        riderId: resolvedRiderId,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      include: {
        vendorOrder: {
          include: {
            userOrder: { include: orderInclude },
            restaurant: { include: vendorInclude },
          },
        },
      },
    });

    const offers = [];
    for (const assignment of assignments) {
      const vendorOrder = assignment.vendorOrder;
      if (!vendorOrder?.userOrder) continue;
      if (vendorOrder.userOrder.riderId || vendorOrder.riderId) continue;

      const offer = await activeOrderShape({
        order: vendorOrder.userOrder,
        vendorOrder,
        restaurant: vendorOrder.restaurant,
      });
      offer.status = "assigned";
      offer.restaurantAddress = restaurantAddress(vendorOrder.restaurant);
      offers.push(offer);
    }

    return offers;
  },

  async getOrderDetails(riderId, orderId) {
    const resolvedRiderId = await resolveId(prisma.rider, riderId);
    if (!resolvedRiderId) return null;

    const found = await findOrderByAnyId(orderId);
    if (!found?.order) return null;

    const assignedOwner = found.order.riderId === resolvedRiderId || found.vendorOrder?.riderId === resolvedRiderId;
    let candidate = false;
    if (!assignedOwner) {
      const assignment = await prisma.riderAssignment.findFirst({
        where: {
          riderId: resolvedRiderId,
          orderId: found.order.id,
          status: "pending",
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      candidate = Boolean(assignment);
    }

    if (!assignedOwner && !candidate) return null;
    return detailOrderShape(found);
  },

  async listOrders(riderId) {
    const resolvedRiderId = await resolveId(prisma.rider, riderId);
    if (!resolvedRiderId) return [];

    const orders = await prisma.order.findMany({
      where: { riderId: resolvedRiderId },
      orderBy: { createdAt: "desc" },
      include: orderInclude,
    });

    return orders.map(orderHistoryShape);
  },
};
