import Notification from '../model/notification/notification.model.js';
import webpush from 'web-push';
import PushSubscription from '../model/notification/pushSubscription.model.js';
import VendorPushSubscription from '../model/notification/vendorPushSubscription.model.js';
import AdminPushSubscription from '../model/notification/adminPushSubscription.model.js';
import { emitToUser, emitToRestaurant, emitToAdmin } from '../socket/socketServer.js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize VAPID details
const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const email = process.env.VAPID_EMAIL || 'mailto:grubdash001@gmail.com';

if (publicKey && privateKey) {
    webpush.setVapidDetails(email, publicKey, privateKey);
}

/**
 * Notification type configurations
 */
const NOTIFICATION_CONFIGS = {
    order_placed: {
        title: '🎉 Order Placed!',
        getBody: (orderId) => `Your order #${orderId} has been placed successfully.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    order_confirmed: {
        title: '✅ Order Confirmed',
        getBody: (orderId) => `Your order #${orderId} has been confirmed by the restaurant.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    order_preparing: {
        title: '👨‍🍳 Order Preparing',
        getBody: (orderId) => `Your delicious food is being prepared! Order #${orderId}`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    order_ready: {
        title: '📦 Order Ready',
        getBody: (orderId) => `Your order #${orderId} is ready for pickup/delivery!`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    order_dispatched: {
        title: '🚚 Order Dispatched',
        getBody: (orderId) => `Your order #${orderId} is on the way!`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    order_delivered: {
        title: '🎊 Order Delivered',
        getBody: (orderId) => `Your order #${orderId} has been delivered. Enjoy your meal!`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    order_cancelled: {
        title: '❌ Order Cancelled',
        getBody: (orderId) => `Your order #${orderId} has been cancelled.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    delivery_nearby: {
        title: '📍 Delivery Nearby',
        getBody: (orderId) => `Your delivery rider is approaching! Order #${orderId}`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200]
    },
    vendor_new_order: {
        title: '🔔 New Order Received!',
        getBody: (orderId) => `You have a new order #${orderId}. Check your dashboard to start preparing.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 300]
    },
    vendor_order_cancelled: {
        title: '⚠️ Order Cancelled',
        getBody: (orderId) => `Order #${orderId} has been cancelled by the customer.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: true
    },
    promo: {
        title: '🎁 Special Offer',
        getBody: (message) => message,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    }
};

/**
 * Create and send notification
 * 
 * @param {String} recipientId - Recipient ID (User, Vendor, or Admin ID)
 * @param {String} type - Notification type
 * @param {Object} data - Notification data
 * @param {String} role - Recipient role ('user', 'vendor', 'admin')
 */
export async function sendNotification(recipientId, type, data = {}, role = 'user') {
    try {
        // ✅ Validate recipientId (Required unless restaurantId is provided in data)
        if (!recipientId && !data.restaurantId) {
            console.error('❌ Missing recipient: neither recipientId nor restaurantId provided');
            throw new Error('Notification must have a recipient');
        }

        console.log(`📨 Preparing notification for ${role} ${recipientId}, type: ${type}`);

        const config = NOTIFICATION_CONFIGS[type];

        if (!config) {
            console.error(`❌ Unknown notification type: ${type}`);
            throw new Error(`Unknown notification type: ${type}`);
        }

        // Build notification payload
        const notificationData = {
            userId: role === 'user' ? recipientId : (data.userId || null),
            restaurantId: role === 'vendor' ? recipientId : (data.restaurantId || null),
            adminId: role === 'admin' ? recipientId : null,
            type,
            title: config.title,
            body: data.message || (data.orderId ? config.getBody(data.orderId) : config.getBody(data.customMessage)),
            icon: data.icon || config.icon,
            image: data.image,
            url: data.url || (data.orderId ? (role === 'vendor' ? `/vendor/orders/${data.orderId}` : `/profile/orders/${data.orderId}`) : '/notifications'),
            orderId: data.orderId,
            read: false,
            data: data.additionalData || {}
        };

        console.log(`💾 Saving notification to database:`, {
            userId: notificationData.userId,
            type: notificationData.type,
            title: notificationData.title,
            orderId: notificationData.orderId
        });

        // 1. Save to database with explicit error handling
        let savedNotification;
        try {
            savedNotification = await Notification.create(notificationData);
            console.log(`✅ Notification saved successfully: ID ${savedNotification._id}`);
        } catch (dbError) {
            console.error('❌ Database save error:', dbError.message);
            if (dbError.errors) console.error('❌ Validation errors:', dbError.errors);

            // ✅ IMPROVEMENT: Log full error details
            console.error('❌ Full DB Error:', {
                message: dbError.message,
                name: dbError.name,
                code: dbError.code,
                notificationData
            });

            throw new Error(`Failed to save notification: ${dbError.message}`);
        }

        // 2. Emit via WebSocket (Real-time in-app notification)
        try {
            if (role === 'user' && recipientId) {
                emitToUser(recipientId, 'new_notification', {
                    _id: savedNotification._id,
                    title: notificationData.title,
                    body: notificationData.body,
                    type: notificationData.type,
                    orderId: notificationData.orderId,
                    url: notificationData.url,
                    icon: notificationData.icon,
                    image: notificationData.image,
                    createdAt: savedNotification.createdAt,
                    read: false
                });
                console.log(`✅ WebSocket notification emitted to user ${recipientId}`);

                // 3. Emit unread count update
                const unreadCount = await Notification.countDocuments({
                    userId: recipientId,
                    read: false
                });
                emitToUser(recipientId, 'notification_count_update', { count: unreadCount });
                console.log(`✅ Unread count updated for user: ${unreadCount}`);
            }

            if ((role === 'vendor' && recipientId) || data.restaurantId) {
                const targetResId = role === 'vendor' ? recipientId : data.restaurantId;
                emitToRestaurant(targetResId, 'new_notification', {
                    _id: savedNotification._id,
                    title: notificationData.title,
                    body: notificationData.body,
                    type: notificationData.type,
                    orderId: notificationData.orderId,
                    url: notificationData.url,
                    icon: notificationData.icon,
                    image: notificationData.image,
                    createdAt: savedNotification.createdAt,
                    read: false
                });
                console.log(`✅ WebSocket notification emitted to restaurant ${targetResId}`);
            }

            if (role === 'admin' && recipientId) {
                emitToAdmin(recipientId, 'new_notification', {
                    _id: savedNotification._id,
                    title: notificationData.title,
                    body: notificationData.body,
                    type: notificationData.type,
                    url: notificationData.url,
                    createdAt: savedNotification.createdAt,
                    read: false
                });
            }
        } catch (socketError) {
            console.error('❌ Socket.IO emission error:', socketError.message);
            // Don't fail the notification if Socket.IO fails
        }

        // 4. Send push notification to all recipient's devices
        try {
            let subModel;
            let queryField;
            if (role === 'vendor') {
                subModel = VendorPushSubscription;
                queryField = 'vendorId';
            } else if (role === 'admin') {
                subModel = AdminPushSubscription;
                queryField = 'adminId';
            } else {
                subModel = PushSubscription;
                queryField = 'userId';
            }

            const subscriptions = await subModel.find({ [queryField]: recipientId });

            if (subscriptions.length > 0) {
                console.log(`📱 Sending push to ${subscriptions.length} device(s)`);

                const pushPayload = {
                    title: notificationData.title,
                    body: notificationData.body,
                    icon: notificationData.icon,
                    image: notificationData.image,
                    badge: '/icons/badge-72x72.png',
                    type: notificationData.type,
                    orderId: notificationData.orderId,
                    url: notificationData.url,
                    tag: data.orderId ? `order-${data.orderId}` : `notification-${Date.now()}`,
                    requireInteraction: config.requireInteraction,
                    vibrate: config.vibrate || [200, 100, 200],
                    timestamp: Date.now(),
                    data: {
                        url: notificationData.url,
                        orderId: notificationData.orderId,
                        type: notificationData.type,
                        ...data.additionalData
                    }
                };

                const pushPromises = subscriptions.map(async (sub) => {
                    try {
                        await webpush.sendNotification(
                            sub.subscription,
                            JSON.stringify(pushPayload)
                        );
                        console.log(`✅ Push sent to device: ${sub.deviceType}`);
                    } catch (error) {
                        console.error(`❌ Failed to send push to ${sub.deviceType}:`, error.message);

                        if (error.statusCode === 410 || error.statusCode === 404) {
                            await subModel.findByIdAndDelete(sub._id);
                            console.log(`🗑️ Removed expired subscription for ${sub.deviceType} (${role})`);
                        }
                    }
                });

                await Promise.allSettled(pushPromises);
            } else {
                console.log(`ℹ️ No push subscriptions found for ${role}: ${recipientId}`);
            }
        } catch (pushError) {
            console.error('❌ Push notification error:', pushError.message);
            // Don't fail if push fails
        }

        return savedNotification;

    } catch (error) {
        console.error('❌ Notification service critical error:', error.message);
        console.error('❌ Stack:', error.stack);
        throw error;
    }
}

/**
 * Send order status notification
 * Convenience wrapper for order-related notifications
 */
export async function sendOrderNotification(userId, orderId, status, orderDetails = {}) {
    // ✅ CRITICAL: Validate and convert userId to String
    if (!userId) {
        console.error('❌ sendOrderNotification: userId is missing');
        throw new Error('userId is required for sending notifications');
    }

    // Convert to String if it's an ObjectId
    const userIdString = String(userId);

    // ✅ Validate orderId
    if (!orderId) {
        console.error('❌ sendOrderNotification: orderId is missing');
        throw new Error('orderId is required for sending notifications');
    }

    console.log(`📦 Sending order notification: User ${userIdString}, Order ${orderId}, Status: ${status}`);

    const typeMap = {
        'placed': 'order_placed',
        'pending': 'order_placed',
        'accepted': 'order_confirmed',
        'confirmed': 'order_confirmed',
        'preparing': 'order_preparing',
        'ready': 'order_ready',
        'ready_for_pickup': 'order_ready',
        'rider_assigned': 'order_dispatched',
        'dispatched': 'order_dispatched',
        'out_for_delivery': 'order_dispatched',
        'delivered': 'order_delivered',
        'cancelled': 'order_cancelled',
        'failed': 'order_cancelled',
        'refunded': 'order_cancelled',
        'completed': 'order_delivered'
    };

    const type = typeMap[status.toLowerCase()];

    if (!type) {
        console.error(`❌ Unknown order status: ${status}`);
        throw new Error(`Unknown order status: ${status}`);
    }

    console.log(`✅ Mapped status "${status}" to notification type "${type}"`);

    return sendNotification(userIdString, type, {
        orderId,
        additionalData: orderDetails
    });
}

/**
 * Send notification to a vendor/restaurant
 */
export async function sendVendorNotification(restaurantId, orderId, type, data = {}) {
    if (!restaurantId) {
        console.error('❌ sendVendorNotification: restaurantId is missing');
        throw new Error('restaurantId is required');
    }

    const restaurantIdString = String(restaurantId);
    console.log(`🏪 Sending vendor notification: Restaurant ${restaurantIdString}, Order ${orderId}, Type: ${type}`);

    // 1. Notify the Vendor Account itself (Direct Push/WebSocket)
    const vendorMainPromise = sendNotification(restaurantIdString, type, {
        orderId,
        restaurantId: restaurantIdString,
        url: `/vendor/orders/${orderId}`,
        ...data
    }, 'vendor');

    // 2. Notify the owner users (if any)
    try {
        const Vendor = (await import('../model/vendor/vendor.model.js')).default;
        const vendor = await Vendor.findById(restaurantIdString).select('owners');

        if (vendor && vendor.owners && vendor.owners.length > 0) {
            console.log(`👥 Notifying ${vendor.owners.length} vendor owner(s)`);
            const ownerPromises = vendor.owners.map(ownerId =>
                sendNotification(String(ownerId), type, {
                    orderId,
                    restaurantId: restaurantIdString,
                    url: `/vendor/orders/${orderId}`,
                    ...data
                }, 'user')
            );
            await Promise.allSettled([vendorMainPromise, ...ownerPromises]);
        } else {
            await vendorMainPromise;
        }
    } catch (err) {
        console.error('❌ Error in sendVendorNotification cascade:', err.message);
        await vendorMainPromise; // Ensure at least the main vendor gets it
    }
}

/**
 * Save or update push subscription
 */
export async function saveSubscription(userId, subscription, deviceType = 'unknown') {
    return await PushSubscription.findOneAndUpdate(
        { 'subscription.endpoint': subscription.endpoint },
        { userId, subscription, deviceType },
        { upsert: true, new: true }
    );
}

/**
 * Remove push subscription
 */
export async function removeSubscription(endpoint) {
    return await PushSubscription.deleteOne({ 'subscription.endpoint': endpoint });
}
