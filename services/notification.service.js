import Notification from '../model/notification/notification.model.js';
import webpush from 'web-push';
import PushSubscription from '../model/notification/pushSubscription.model.js';
import { emitToUser } from '../socket/socketServer.js';
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
 * @param {String} userId - User ID to send notification to
 * @param {String} type - Notification type (order_placed, order_confirmed, etc.)
 * @param {Object} data - Notification data
 * @param {String} data.orderId - Order ID (for order-related notifications)
 * @param {String} data.message - Custom message (optional)
 * @param {String} data.url - Deep link URL (optional)
 * @param {String} data.image - Banner image URL (optional)
 */
export async function sendNotification(userId, type, data = {}) {
    try {
        // ✅ Validate userId is a String
        if (!userId || typeof userId !== 'string') {
            console.error('❌ Invalid userId:', userId, typeof userId);
            throw new Error('userId must be a valid string');
        }

        console.log(`📨 Preparing notification for user ${userId}, type: ${type}`);

        const config = NOTIFICATION_CONFIGS[type];

        if (!config) {
            console.error(`❌ Unknown notification type: ${type}`);
            throw new Error(`Unknown notification type: ${type}`);
        }

        // Build notification payload
        const notificationData = {
            userId,
            type,
            title: config.title,
            body: data.message || (data.orderId ? config.getBody(data.orderId) : config.getBody(data.customMessage)),
            icon: data.icon || config.icon,
            image: data.image,
            url: data.url || (data.orderId ? `/profile/orders/${data.orderId}` : '/notifications'),
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
            emitToUser(userId, 'new_notification', {
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
            console.log(`✅ WebSocket notification emitted to user ${userId}`);

            // 3. Emit unread count update
            const unreadCount = await Notification.countDocuments({
                userId,
                read: false
            });
            emitToUser(userId, 'notification_count_update', { count: unreadCount });
            console.log(`✅ Unread count updated: ${unreadCount}`);
        } catch (socketError) {
            console.error('❌ Socket.IO emission error:', socketError.message);
            // Don't fail the notification if Socket.IO fails
        }

        // 4. Send push notification to all user's devices
        try {
            const subscriptions = await PushSubscription.find({ userId });

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
                            await PushSubscription.findByIdAndDelete(sub._id);
                            console.log(`🗑️ Removed expired subscription for ${sub.deviceType}`);
                        }
                    }
                });

                await Promise.allSettled(pushPromises);
            } else {
                console.log(`ℹ️ No push subscriptions found for user: ${userId}`);
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
