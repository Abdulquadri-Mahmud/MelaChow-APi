import Notification from '../model/notification/notification.model.js';
import webpush from 'web-push';
import PushSubscription from '../model/notification/pushSubscription.model.js';
import VendorPushSubscription from '../model/notification/vendorPushSubscription.model.js';
import AdminPushSubscription from '../model/notification/adminPushSubscription.model.js';
import RiderPushSubscription from '../model/notification/riderPushSubscription.model.js';
import { emitToUser, emitToRestaurant, emitToAdmin, emitToRider } from '../socket/socketServer.js';
import { redisClient, isRedisReady, safeRedisGet, safeRedisSet } from '../config/redis.js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize VAPID details
const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const email = process.env.VAPID_EMAIL || 'mailto:melachow001@gmail.com';

if (publicKey && privateKey) {
    webpush.setVapidDetails(email, publicKey, privateKey);
}

/**
 * Notification type configurations
 */

const NOTIFICATION_CONFIGS = {
    order_placed: {
        title: 'Order Placed!',
        getBody: (data) => `Your order #${data.orderId} from ${data.restaurantName || 'the restaurant'} has been placed successfully.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    order_confirmed: {
        title: 'Order Confirmed',
        getBody: (data) => `Your order #${data.orderId} has been confirmed by ${data.restaurantName || 'the restaurant'}.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    order_preparing: {
        title: 'Order Preparing',
        getBody: (data) => `Your food from ${data.restaurantName || 'the restaurant'} is being prepared! Order #${data.orderId}`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    order_ready: {
        title: 'Order Ready',
        getBody: (data) => `Your order #${data.orderId} from ${data.restaurantName || 'the restaurant'} is ready!`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    order_dispatched: {
        title: 'Order Dispatched',
        getBody: (data) => `Your order #${data.orderId} from ${data.restaurantName || 'the restaurant'} is on the way!`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    order_delivered: {
        title: 'Order Delivered',
        getBody: (data) => `Your order #${data.orderId} has been delivered. Enjoy your meal from ${data.restaurantName || 'the restaurant'}!`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    order_cancelled: {
        title: 'Order Cancelled',
        getBody: (data) => `Your order #${data.orderId} from ${data.restaurantName || 'the restaurant'} has been cancelled.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    delivery_nearby: {
        title: 'Delivery Nearby',
        getBody: (data) => `Your delivery rider is approaching with your order #${data.orderId}!`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200]
    },
    vendor_new_order: {
        title: 'New Order Received!',
        getBody: (data) => {
            const customerPart = data.customerName ? ` from ${data.customerName}` : '';
            const locationPart = data.location ? ` to ${data.location}` : '';
            return `You have a new order #${data.orderId}${customerPart}${locationPart}. Check your dashboard to start preparing.`;
        },
        icon: '/icons/icon-192x192.png',
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 300]
    },
    vendor_order_cancelled: {
        title: 'Order Cancelled',
        getBody: (data) => `Order #${data.orderId} has been cancelled by ${data.customerName || 'the customer'}.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: true
    },
    order_assigned: {
        title: 'New Job Assigned!',
        getBody: (data) => `Head to ${data.restaurantName || 'the store'} for pickup. Earn ₦${data.payout || 600}. Order #${data.orderId}`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200]
    },
    rider_payout_credited: {
        title: 'Earnings Credited! 💰',
        getBody: (data) => `Order #${data.orderId} delivered. ₦${data.payout || 600} has been added to your wallet.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    vendor_order_delivered: {
        title: 'Order Delivered & Earnings Credited',
        getBody: (data) => `Order #${data.orderId || data._id?.slice(-6)} has been successfully delivered. Your earnings have been updated.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    admin_order_ready: {
        title: 'Platform Order Ready',
        getBody: (data) => `${data.restaurantName || 'Restaurant'} marked Order #${data.orderId || data._id?.slice(-6)} as ready. Assign rider now!`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: true,
        vibrate: [400, 100, 400, 100, 400]
    },
    rider_assignment_needed: {
        title: 'Manual Assignment Required',
        getBody: (data) => `Logistics alert: No rider found for Order #${data.id || data.orderId}. Immediate manual assignment needed.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: true,
        vibrate: [500, 100, 500, 100, 500]
    },
    admin_order_delivered: {
        title: 'Order Delivery Completed',
        getBody: (data) => `Platform Order #${data.orderId || data._id?.slice(-6)} has been delivered correctly to the customer.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    vendor_review: {
        title: 'New Merchant Review',
        getBody: (data) => `Customer left a review for ${data.restaurantName || 'a vendor'}. View feedback in the portal.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    admin_insufficient_funds: {
        title: 'Financial Alert: Payout Blocked',
        getBody: (data) => `CRITICAL: Admin wallet insufficient (₦${data.adminBalance}) for Order #${data.orderId} payout (₦${data.riderPayout}). Top up now!`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: true,
        vibrate: [500, 200, 500, 200, 500]
    },
    vendor_rider_assigned: {
        title: 'Rider Assigned',
        getBody: (data) => `Rider ${data.riderName || 'a driver'} has been assigned to pick up Order #${data.orderId}.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    system: {
        title: 'Platform System Alert',
        getBody: (data) => data.message || 'New system update or administrative message.',
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    promo: {
        title: 'Special Offer',
        getBody: (data) => data.message || 'Check out our latest discount!',
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    admin_new_vendor: {
        title: 'New Vendor Alert!',
        getBody: (data) => `Merchant "${data.storeName}" has just registered. Audit required for activation.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: true,
        vibrate: [500, 100, 500, 100, 500]
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
        // Validate recipientId (Required unless role is admin OR restaurantId is provided)
        if (!recipientId && role !== 'admin' && !data.restaurantId) {
            console.error('Missing recipient: neither recipientId nor restaurantId provided');
            throw new Error('Notification must have a recipient');
        }

        console.log(`Preparing notification for ${role} ${recipientId || '(Broadcast)'}, type: ${type}`);

        const config = NOTIFICATION_CONFIGS[type] || {
            title: data.title || 'System Notification',
            getBody: () => data.message || 'New update regarding your order',
            icon: '/icons/icon-192x192.png'
        };

        // Build notification payload
        const notificationData = {
            userId: role === 'user' ? recipientId : (data.userId || null),
            restaurantId: role === 'vendor' ? recipientId : (data.restaurantId || null),
            riderId: role === 'rider' ? recipientId : (data.riderId || null),
            adminId: role === 'admin' ? recipientId : null,
            role: role, // Store the role explicitly in the DB for easier filtering
            type,
            title: config.title,
            body: data.message || config.getBody({ payout: data.payout,
                orderId: data.orderId,
                restaurantName: data.restaurantName,
                customerName: data.customerName,
                location: data.location,
                customMessage: data.customMessage
            }),
            icon: data.icon || config.icon,
            image: data.image,
            url: data.url || (data.orderId ? (
                role === 'vendor' ? `/vendors/orders/${data.orderDatabaseId || data.orderId}` :
                role === 'rider' ? `/rider/dashboard` :
                role === 'admin' ? `/admin/orders/${data.orderDatabaseId || data.orderId}` :
                `/track-orders/${data.orderId}`
            ) : '/notifications'),
            orderId: data.orderId,
            read: false,
            data: data.additionalData || {}
        };

        console.log(`Saving notification to database:`, {
            recipient: role,
            recipientId: recipientId || "All Admins",
            type: notificationData.type
        });

        // 1. Save to database
        let savedNotification;
        // Broadcast admin notifications are saved with recipientId = null but marked with role = 'admin'
        if (recipientId || role === 'admin') {
            try {
                savedNotification = await Notification.create(notificationData);
                console.log(`Notification saved successfully for ${role}${recipientId ? `: ID ${savedNotification._id}` : ' (Broadcast)'}`);
            } catch (dbError) {
                console.error('Database save error:', dbError.message);
            }
        }

        // 2. Emit via WebSocket (Real-time in-app notification)
        try {
            if (role === 'user' && recipientId) {
                emitToUser(recipientId, 'new_notification', {
                    _id: savedNotification?._id,
                    title: notificationData.title,
                    body: notificationData.body,
                    type: notificationData.type,
                    orderId: notificationData.orderId,
                    url: notificationData.url,
                    icon: notificationData.icon,
                    image: notificationData.image,
                    createdAt: savedNotification?.createdAt || new Date(),
                    read: false
                });
                
                // Unread count logic
                let unreadCount = 0;
                const redisKey = `user:${recipientId}:unread_count`;
                if (isRedisReady()) {
                    try {
                        unreadCount = await redisClient.incr(redisKey);
                        await redisClient.expire(redisKey, 604800);
                    } catch (err) {
                        unreadCount = await Notification.countDocuments({ userId: recipientId, read: false });
                    }
                } else {
                    unreadCount = await Notification.countDocuments({ userId: recipientId, read: false });
                }
                emitToUser(recipientId, 'notification_count_update', { count: unreadCount });
            }

            if ((role === 'vendor' && recipientId) || data.restaurantId) {
                const targetResId = role === 'vendor' ? recipientId : data.restaurantId;
                emitToRestaurant(targetResId, 'new_notification', {
                    _id: savedNotification?._id,
                    title: notificationData.title,
                    body: notificationData.body,
                    type: notificationData.type,
                    orderId: notificationData.orderId,
                    url: notificationData.url,
                    icon: notificationData.icon,
                    image: notificationData.image,
                    createdAt: savedNotification?.createdAt || new Date(),
                    read: false
                });
            }

            if (role === 'admin') {
                emitToAdmin(recipientId, 'new_notification', {
                    _id: savedNotification?._id,
                    title: notificationData.title,
                    body: notificationData.body,
                    type: notificationData.type,
                    url: notificationData.url,
                    createdAt: savedNotification?.createdAt || new Date(),
                    read: false
                });
            }

            if (role === 'rider' && recipientId) {
                emitToRider(recipientId, 'new_notification', {
                    _id: savedNotification?._id,
                    title: notificationData.title,
                    body: notificationData.body,
                    type: notificationData.type,
                    orderId: notificationData.orderId,
                    url: notificationData.url,
                    createdAt: savedNotification?.createdAt || new Date(),
                    read: false
                });
                const count = await Notification.countDocuments({ riderId: recipientId, read: false });
                emitToRider(recipientId, 'notification_count_update', { count });
            }
        } catch (socketError) {
            console.error('Socket.IO emission error:', socketError.message);
        }

        // 3. Send push notification to all recipient's devices
        try {
            let subModel;
            let queryField;
            if (role === 'vendor') {
                subModel = VendorPushSubscription;
                queryField = 'vendorId';
            } else if (role === 'admin') {
                subModel = AdminPushSubscription;
                queryField = 'adminId';
            } else if (role === 'rider') {
                subModel = RiderPushSubscription;
                queryField = 'riderId';
            } else {
                subModel = PushSubscription;
                queryField = 'userId';
            }

            // Find subscriptions (either for specific recipient or all if role is admin and no ID)
            const query = recipientId ? { [queryField]: recipientId } : {};
            const subscriptions = await subModel.find(query);

            if (subscriptions.length > 0) {
                console.log(`Sending push to ${subscriptions.length} ${role} device(s)`);

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
                        console.log(`Push sent to device: ${sub.deviceType}`);
                    } catch (error) {
                        console.error(`Failed to send push to ${sub.deviceType}:`, error.message);

                        if (error.statusCode === 410 || error.statusCode === 404) {
                            await subModel.findByIdAndDelete(sub._id);
                            console.log(`Removed expired subscription for ${sub.deviceType} (${role})`);
                        }
                    }
                });

                await Promise.allSettled(pushPromises);
            } else {
                console.log(`No push subscriptions found for ${role}: ${recipientId}`);
            }
        } catch (pushError) {
            console.error('Push notification error:', pushError.message);
            // Don't fail if push fails
        }

        return savedNotification;

    } catch (error) {
        console.error('Notification service critical error:', error.message);
        console.error('Stack:', error.stack);
        throw error;
    }
}

/**
 * Send order status notification
 * Convenience wrapper for order-related notifications
 */
export async function sendOrderNotification(userId, orderId, status, orderDetails = {}) {
    // CRITICAL: Validate and convert userId to String
    if (!userId) {
        console.error('sendOrderNotification: userId is missing');
        throw new Error('userId is required for sending notifications');
    }

    // Convert to String if it's an ObjectId
    const userIdString = String(userId);

    // Validate orderId
    if (!orderId) {
        console.error('sendOrderNotification: orderId is missing');
        throw new Error('orderId is required for sending notifications');
    }

    console.log(`Sending order notification: User ${userIdString}, Order ${orderId}, Status: ${status}`);

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
        console.error(`Unknown order status: ${status}`);
        throw new Error(`Unknown order status: ${status}`);
    }

    console.log(`Mapped status "${status}" to notification type "${type}"`);

    return sendNotification(userIdString, type, {
        orderId,
        orderDatabaseId: orderDetails.orderDatabaseId,
        restaurantName: orderDetails.restaurantName,
        additionalData: orderDetails
    });
}

/**
 * Send notification to a rider
 */
export async function sendRiderNotification(riderId, orderId, type, data = {}) {
    if (!riderId) {
        console.error('sendRiderNotification: riderId is missing');
        throw new Error('riderId is required');
    }

    const riderIdString = String(riderId);
    console.log(`Sending rider notification: Rider ${riderIdString}, Order ${orderId}, Type: ${type}`);

    return sendNotification(riderIdString, type, {
        orderId,
        orderDatabaseId: data.orderDatabaseId,
        restaurantName: data.restaurantName,
        url: `/rider/dashboard`,
        ...data
    }, 'rider');
}

/**
 * Send notification to a vendor/restaurant
 */
export async function sendVendorNotification(restaurantId, orderId, type, data = {}) {
    if (!restaurantId) {
        console.error('sendVendorNotification: restaurantId is missing');
        throw new Error('restaurantId is required');
    }

    const restaurantIdString = String(restaurantId);
    console.log(`Sending vendor notification: Restaurant ${restaurantIdString}, Order ${orderId}, Type: ${type}`);

    // Deep Link Consistency Fix: 
    // Vendors deep-link to /vendors/orders/[VendorOrder._id]. 
    // If orderDatabaseId is missing, we auto-resolve it from the parent Order.
    if (!data.orderDatabaseId && orderId) {
        try {
            const VendorOrder = (await import('../model/vendor/VendorOrder.js')).default;
            const Order = (await import('../model/order/Order.js')).default;
            let parentOrderDBId = null;

            if (String(orderId).match(/^[0-9a-fA-F]{24}$/)) {
                if (await VendorOrder.exists({ _id: orderId })) {
                    data.orderDatabaseId = orderId;
                } else {
                    parentOrderDBId = orderId;
                }
            } else if (String(orderId).startsWith('ORD-')) {
                const po = await Order.findOne({ orderId }).select('_id');
                if (po) parentOrderDBId = po._id;
            }

            if (parentOrderDBId && !data.orderDatabaseId) {
                const subOrder = await VendorOrder.findOne({ 
                    userOrderId: parentOrderDBId, 
                    restaurantId: restaurantIdString 
                }).select('_id');
                if (subOrder) data.orderDatabaseId = subOrder._id;
            }
        } catch (e) {
            console.warn('Vendor notification auto-resolution failed:', e.message);
        }
    }

    // 1. Notify the Vendor Account itself (Direct Push/WebSocket)
    const vendorMainPromise = sendNotification(restaurantIdString, type, {
        orderId,
        orderDatabaseId: data.orderDatabaseId,
        customerName: data.customerName,
        location: data.location,
        restaurantId: restaurantIdString,
        url: `/vendors/orders/${data.orderDatabaseId || orderId}`,
        ...data
    }, 'vendor');
    
    // 2. Notify the owner users (if any)
    try {
        const Vendor = (await import('../model/vendor/vendor.model.js')).default;
        
        let vendorOwners = null;
        const ownerCacheKey = `vendor:${restaurantIdString}:owners`;
        
        if (isRedisReady()) {
            try {
                const cached = await redisClient.get(ownerCacheKey);
                if (cached) {
                    vendorOwners = JSON.parse(cached);
                    console.log(`Vendor owners served from Redis cache`);
                }
            } catch (err) {
                console.warn('Redis vendor owner cache read failed');
            }
        }
        
        if (!vendorOwners) {
            const vendor = await Vendor.findById(restaurantIdString).select('owners');
            vendorOwners = vendor?.owners || [];
            if (isRedisReady() && vendorOwners.length > 0) {
                try {
                    // Cache for 30 minutes — vendor ownership changes are infrequent
                    // IMPORTANT: When a vendor's profile is updated (ownership change), 
                    // the calling controller must invalidate this cache key:
                    // await redisClient.del(`vendor:${vendorId}:owners`);
                    await redisClient.set(ownerCacheKey, JSON.stringify(vendorOwners), 'EX', 1800);
                } catch (err) {
                    console.warn('Redis vendor owner cache write failed');
                }
            }
        }

        if (vendorOwners && vendorOwners.length > 0) {
            console.log(`Notifying ${vendorOwners.length} vendor owner(s)`);
            const ownerPromises = vendorOwners.map(ownerId =>
                sendNotification(String(ownerId), type, {
                    orderId,
                    restaurantId: restaurantIdString,
                    url: `/vendors/orders/${data.orderDatabaseId || orderId}`,
                    ...data
                }, 'user')
            );
            await Promise.allSettled([vendorMainPromise, ...ownerPromises]);
        } else {
            await vendorMainPromise;
        }
    } catch (err) {
        console.error('Error in sendVendorNotification cascade:', err.message);
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

/**
 * Sync unread count to Redis from MongoDB
 * Called during reconciliation or when resetting counts
 */
export async function syncUnreadCountToRedis(userId) {
    try {
        const trueCount = await Notification.countDocuments({
            userId: String(userId),
            read: false
        });
        const redisKey = `user:${userId}:unread_count`;
        if (isRedisReady()) {
            await redisClient.set(redisKey, trueCount, 'EX', 604800);
        }
        return trueCount;
    } catch (err) {
        console.error('syncUnreadCountToRedis failed:', err.message);
        return null;
    }
}

/**
 * Broadcast notification to all admins
 */
export async function notifyAdmins(type, data = {}) {
    return sendNotification(null, type, data, 'admin');
}

