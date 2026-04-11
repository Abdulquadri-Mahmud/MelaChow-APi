import { emitToUser, emitToOrder, emitToRestaurant } from '../socketServer.js';

/**
 * Emit order status update to all relevant parties
 */
export function emitOrderStatusUpdate(order, previousStatus) {
    const eventData = {
        orderId: order.orderId || order._id,
        status: order.status || order.orderStatus,
        previousStatus,
        restaurantName: order.restaurantName,
        totalAmount: order.totalAmount || order.total,
        estimatedDeliveryTime: order.estimatedDeliveryTime,
        rider: order.rider || null,
        timestamp: new Date().toISOString()
    };

    // 1. Notify customer
    emitToUser(order.userId, 'order_status_update', eventData);

    // 2. Notify anyone tracking this specific order
    emitToOrder(order.orderId || order._id, 'order_status_update', eventData);

    // 3. Notify restaurant (if vendor is online)
    if (order.restaurantId) {
        emitToRestaurant(order.restaurantId, 'order_update', {
            ...eventData,
            customerName: order.deliveryAddress?.name,
            items: order.items
        });
    }

    console.log(`📡 Order status update emitted: ${order.orderId} (${previousStatus} → ${order.status || order.orderStatus})`);
}

/**
 * Emit new order notification to restaurant
 */
export function emitNewOrderToRestaurant(orderAndMetadata) {
    // If we're passing in `{ ...order.toObject(), restaurantId }`,
    // the target restaurantId is exactly that explicitly passed one.
    const targetRestaurantId = String(orderAndMetadata.restaurantId);

    // Filter items to only show the items meant for THIS vendor
    const itemsForThisVendor = (orderAndMetadata.items || []).filter(
        i => String(i.restaurantId) === targetRestaurantId
    );

    const eventData = {
        orderId:         orderAndMetadata.orderId || orderAndMetadata._id,
        vendorOrderId:   orderAndMetadata.vendorOrderId,
        customerName:    orderAndMetadata.deliveryAddress?.name,
        customerPhone:   orderAndMetadata.phone,
        items:           itemsForThisVendor,
        totalAmount:     orderAndMetadata.totalAmount || orderAndMetadata.total,
        deliveryAddress: orderAndMetadata.deliveryAddress,
        notes:           orderAndMetadata.notes,
        timestamp:       new Date().toISOString(),
    };

    emitToRestaurant(targetRestaurantId, 'new_order', eventData);
    console.log(`🔔 New order notification sent to restaurant ${targetRestaurantId}`);
}

/**
 * Emit delivery location update
 */
export function emitDeliveryLocationUpdate(orderId, userId, location) {
    const eventData = {
        orderId,
        driverLocation: {
            latitude: location.latitude,
            longitude: location.longitude,
            heading: location.heading,
            speed: location.speed
        },
        estimatedArrival: location.estimatedArrival,
        timestamp: new Date().toISOString()
    };

    // Notify customer
    emitToUser(userId, 'delivery_location_update', eventData);

    // Notify order room
    emitToOrder(orderId, 'delivery_location_update', eventData);

    console.log(`📍 Delivery location updated for order ${orderId}`);
}

/**
 * Emit restaurant online/offline status
 */
export function emitRestaurantStatusChange(restaurantId, isOnline, reason) {
    const eventData = {
        restaurantId,
        isOnline,
        reason,
        timestamp: new Date().toISOString()
    };

    emitToRestaurant(restaurantId, 'restaurant_status_change', eventData);
    console.log(`🏪 Restaurant ${restaurantId} status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
}
