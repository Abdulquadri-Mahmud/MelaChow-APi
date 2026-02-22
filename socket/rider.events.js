// SOCKET_EVENTS — string constants for all event names
export const SOCKET_EVENTS = {
    // Server → Client
    NEW_ORDER: "new_order",
    ORDER_ASSIGNED_TO_RIDER: "order_assigned",
    ORDER_STATUS_UPDATE: "order_status_update",
    ORDER_DELIVERED: "order_delivered",
    RIDER_STATUS_CHANGED: "rider_status_changed",
    ERROR: "socket_error",

    // Client → Server
    RIDER_CONNECT: "rider_connect",
    VENDOR_CONNECT: "vendor_connect",
    CUSTOMER_CONNECT: "customer_connect",
    RIDER_TOGGLE_AVAILABILITY: "rider_toggle_availability",
    RIDER_PICKED_UP: "rider_picked_up",
    RIDER_DELIVERED: "rider_delivered",
};

// SOCKET_ROOMS — room name builder functions (never hardcode room strings)
export const SOCKET_ROOMS = {
    vendor: (vendorId) => `vendor:${vendorId}`,
    rider: (riderId) => `rider:${riderId}`,
    customer: (customerId) => `customer:${customerId}`,
    order: (orderId) => `order:${orderId}`,
};

// buildPayload — consistent payload shapes for every emit
export const buildPayload = {
    newOrder: ({ orderId, customerId, items, total, deliveryAddress, createdAt }) => ({
        orderId,
        customerId,
        items,
        total,
        deliveryAddress,
        createdAt
    }),

    orderAssigned: ({ orderId, vendorId, vendorName, items, deliveryAddress, customerName, customerPhone, note }) => ({
        orderId,
        vendorId,
        vendorName,
        items,
        deliveryAddress,
        customerName,
        customerPhone,
        note
    }),

    statusUpdate: ({ orderId, status, changedBy, message, riderName }) => ({
        orderId,
        status,
        changedBy,
        message,
        riderName,
        timestamp: new Date()
    }),

    orderDelivered: ({ orderId, riderName }) => ({
        orderId,
        riderName,
        deliveredAt: new Date()
    }),

    riderStatusChanged: ({ riderId, riderName, status }) => ({
        riderId,
        riderName,
        status,
        timestamp: new Date()
    })
};
