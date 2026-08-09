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
        getBody: (data) => {
            const reason = data.cancellationReason || data.reason || data.customMessage;
            const reasonPart = reason ? ` Reason: ${reason}.` : '';
            return `Your order #${data.orderId} from ${data.restaurantName || 'the restaurant'} has been cancelled.${reasonPart}`;
        },
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    delivery_confirmation_code: {
        title: 'Delivery confirmation code',
        getBody: (data) => `Your code for order #${data.orderId} is ${data.deliveryOtp}. Share it only after receiving your order.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200]
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
    vendor_rider_assigned: {
        title: 'Rider Offer Sent',
        getBody: (data) => `Rider assignment offer${data.riderName ? ` sent to ${data.riderName}` : ' has been sent'} for Order #${data.orderId}.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    vendor_order_timeout: {
        title: 'Missed Order',
        getBody: (data) => `Order #${data.orderId} was automatically cancelled because it was not accepted in time.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: true,
        vibrate: [500, 100, 500, 100, 500]
    },
    order_assigned: {
        title: 'New Job Assigned!',
        getBody: (data) => `Head to ${data.restaurantName || 'the store'} for pickup. Earn â‚¦${data.payout || 600}. Order #${data.orderId}`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: true,
        vibrate: [200, 100, 200, 100, 200]
    },
    rider_payout_credited: {
        title: 'Earnings Credited! ðŸ’°',
        getBody: (data) => `Order #${data.orderId} delivered. â‚¦${data.payout || 600} has been added to your wallet.`,
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
    rider_assignment_accepted: {
        title: 'Rider Accepted Assignment',
        getBody: (data) => `Rider ${data.riderName || 'assigned rider'} accepted Order #${data.orderId}. Delivery is now underway.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false,
        vibrate: [200, 100, 200]
    },
    rider_assignment_timeout: {
        title: 'Rider Assignment Timed Out',
        getBody: (data) => `Rider ${data.riderName || 'assigned rider'} did not respond to Order #${data.orderId}. Manual reassignment required.`,
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
    vendor_rider_offer: {
        title: 'Rider Offer Sent',
        getBody: (data) => `Rider assignment offer${data.riderName ? ` sent to ${data.riderName}` : ' has been sent'} for Order #${data.orderId}.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    },
    vendor_order_timeout: {
        title: 'Missed Order',
        getBody: (data) => `Order #${data.orderId} was automatically cancelled because it was not accepted in time.`,
        icon: '/icons/icon-192x192.png',
        requireInteraction: true,
        vibrate: [500, 100, 500, 100, 500]
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
    },
    support_update: {
        title: 'Support Ticket Update',
        getBody: (data) => data.message || 'Your MelaChow support ticket has been updated.',
        icon: '/icons/icon-192x192.png',
        requireInteraction: false
    }
};

/**
 * Send notification to a recipient
 */
export async function sendNotification(recipientId, type, data = {}, role = 'user') {
    try {
        const config = NOTIFICATION_CONFIGS[type] || NOTIFICATION_CONFIGS.system;

        const notificationData = {
            userId: role === 'user' ? recipientId : null,
            vendorId: role === 'vendor' ? recipientId : null,
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
                cancellationReason: data.cancellationReason,
                reason: data.reason,
                customMessage: data.customMessage,
                deliveryOtp: data.deliveryOtp
            }),
            icon: data.icon || config.icon,
            image: data.image,
            url: data.url || (data.orderId ? (
                role === 'vendor' ? `/vendors/order/${data.orderDatabaseId || data.orderId}` :
                role === 'rider' ? `/rider/notifications` :
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
                    orderId: notificationData.orderId,
                    url: notificationData.url,
                    data: notificationData.data,
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
                                        data: {
                        url: notificationData.url,
                        orderId: notificationData.orderId,
                        type: notificationData.type,
                        role: notificationData.role,
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

    // Determine the canonical order identifier for user-facing notifications
    const effectiveOrderId = orderDetails.orderId || orderId;

    if (!effectiveOrderId) {
        console.error('sendOrderNotification: orderId is missing');
        throw new Error('orderId is required for sending notifications');
    }

    console.log(`Sending order notification: User ${userIdString}, Order ${effectiveOrderId}, Status: ${status}`);

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
        orderId: effectiveOrderId,
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
    const effectiveOrderId = data.orderId || orderId;

    console.log(`Sending rider notification: Rider ${riderIdString}, Order ${effectiveOrderId}, Type: ${type}`);

    return sendNotification(riderIdString, type, {
        orderId: effectiveOrderId,
        orderDatabaseId: data.orderDatabaseId,
        restaurantName: data.restaurantName,
        url: `/rider/notifications`,
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
    // Vendors deep-link to /vendors/order/[VendorOrder._id]. 
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
        url: `/vendors/order/${data.orderDatabaseId || orderId}`,
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
                    url: `/vendors/order/${data.orderDatabaseId || orderId}`,
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

    // 3. Send email notification to vendor on new order received
    if (type === 'vendor_new_order') {
        sendVendorOrderEmail(restaurantIdString, orderId, data).catch(err => {
            console.error('Failed to send vendor order email:', err.message);
        });
    }
}

/**
 * Send email notification to vendor when a new order is placed
 */
export async function sendVendorOrderEmail(restaurantId, orderId, data = {}) {
    try {
        const { sendMail } = await import('../config/mailer.js');
        const Vendor = (await import('../model/vendor/vendor.model.js')).default;

        const vendor = await Vendor.findById(restaurantId).select('email storeName phone');
        if (!vendor || !vendor.email) {
            console.warn(`[sendVendorOrderEmail] No valid email found for vendor ID ${restaurantId}`);
            return;
        }

        const orderCode = data.orderId || orderId || 'N/A';
        const customerName = data.customerName || 'A customer';
        const location = data.location || 'Specified delivery location';
        const totalAmount = data.totalAmount ? Number(data.totalAmount).toLocaleString() : null;

        const itemsHtml = Array.isArray(data.items) && data.items.length > 0
            ? data.items.map(item => {
                const itemName = item.name || item.foodId?.name || item.variant?.name || 'Food Item';
                const qty = item.quantity || 1;
                const price = item.price ? Number(item.price).toLocaleString() : null;
                return `<tr>
                    <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; font-weight: 600; color: #1e293b;">${itemName}</td>
                    <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; text-align: center; color: #64748b;">x${qty}</td>
                    <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; text-align: right; font-weight: 700; color: #ea580c;">${price ? '₦' + price : '-'}</td>
                </tr>`;
            }).join('')
            : '';

        const vendorPortalUrl = `${process.env.VENDOR_URL || process.env.FRONTEND_URL || 'https://vendor.melachow.com'}/vendors/order/${data.orderDatabaseId || orderId}`;

        const htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; padding: 30px 15px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                <div style="background-color: #ea580c; padding: 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">🛍️ New Order Received!</h1>
                    <p style="color: #ffedd5; margin: 6px 0 0; font-size: 14px; font-weight: 600;">${vendor.storeName || 'Merchant Partner'}</p>
                </div>
                <div style="padding: 28px; color: #334155;">
                    <div style="background-color: #fff7ed; border-left: 4px solid #ea580c; padding: 14px 18px; border-radius: 8px; margin-bottom: 24px;">
                        <span style="display: block; font-size: 11px; font-weight: 800; color: #c2410c; text-transform: uppercase; letter-spacing: 1px;">Order Reference</span>
                        <span style="font-size: 20px; font-weight: 900; color: #0f172a;">#${orderCode}</span>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                        <tr>
                            <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600;">Customer Name:</td>
                            <td style="padding: 6px 0; font-size: 13px; font-weight: 700; color: #0f172a; text-align: right;">${customerName}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600;">Delivery Location:</td>
                            <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #475569; text-align: right;">${location}</td>
                        </tr>
                        ${totalAmount ? `
                        <tr>
                            <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600;">Order Total:</td>
                            <td style="padding: 6px 0; font-size: 16px; font-weight: 900; color: #16a34a; text-align: right;">₦${totalAmount}</td>
                        </tr>
                        ` : ''}
                    </table>

                    ${itemsHtml ? `
                    <h3 style="font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a; margin-bottom: 12px;">Ordered Items</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 28px; background-color: #f8fafc; border-radius: 8px; overflow: hidden;">
                        <thead>
                            <tr style="background-color: #f1f5f9; text-align: left;">
                                <th style="padding: 8px 12px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Item</th>
                                <th style="padding: 8px 12px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; text-align: center;">Qty</th>
                                <th style="padding: 8px 12px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; text-align: right;">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>
                    ` : ''}

                    <div style="text-align: center; margin-top: 24px;">
                        <a href="${vendorPortalUrl}" style="display: inline-block; background-color: #ea580c; color: #ffffff; padding: 14px 28px; border-radius: 12px; font-size: 13px; font-weight: 800; text-decoration: none; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 12px rgba(234,88,12,0.25);">Open Vendor Portal →</a>
                    </div>
                </div>
                <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8; font-weight: 600;">
                    © ${new Date().getFullYear()} MelaChow Vendor Portal. All rights reserved.
                </div>
            </div>
        </div>
        `;

        await sendMail({
            to: vendor.email,
            subject: `🛍️ New Order Received! #${orderCode} — ${vendor.storeName || 'MelaChow'}`,
            html: htmlContent
        });

        console.log(`[sendVendorOrderEmail] ✉️ Order notification email sent to vendor ${vendor.email}`);
    } catch (err) {
        console.error('[sendVendorOrderEmail] Error sending vendor order email:', err.message);
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

/**
 * Send email notification to Super-Admin(s) on successful order creation
 */
export async function sendSuperAdminOrderEmail(order, restaurantNames = '') {
    try {
        const { sendMail } = await import('../config/mailer.js');
        const Admin = (await import('../model/Admin/admin.model.js')).default;
        const Vendor = (await import('../model/vendor/vendor.model.js')).default;

        // Query active super-admins specifically
        const superAdmins = await Admin.find({
            role: { $in: ["super-admin", "super_admin"] },
            isActive: true
        }).select('email name');

        const adminEmails = superAdmins.map(a => a.email).filter(Boolean);

        // Fallback configured email if env set
        const fallbackEmail = process.env.SUPER_ADMIN_EMAIL || process.env.ADMIN_NOTIFY_EMAIL || process.env.ADMIN_EMAIL;
        if (fallbackEmail && !adminEmails.includes(fallbackEmail)) {
            adminEmails.push(fallbackEmail);
        }

        if (adminEmails.length === 0) {
            console.warn('[sendSuperAdminOrderEmail] No super-admin emails found to receive order notification');
            return;
        }

        // Get restaurant details for phone numbers
        const restaurantIds = [...new Set((order.items || []).map(item => String(item.restaurantId || item.restaurant)))].filter(Boolean);
        const vendors = await Vendor.find({ _id: { $in: restaurantIds } }).select('storeName phone email');
        const vendorContacts = vendors.map(v => `${v.storeName} (${v.phone || 'No phone'})`).join(', ');

        const orderCode = order.orderId || String(order._id).slice(-8);
        const customerName = order.deliveryAddress?.name || order.userId?.firstname || 'Customer';
        const customerPhone = order.deliveryAddress?.phone || order.phone || order.userId?.phone || 'N/A';
        const totalAmount = Number(order.total || 0).toLocaleString();
        const addressText = order.deliveryAddress ? `${order.deliveryAddress.address || ''}, ${order.deliveryAddress.city || ''}` : 'Standard Delivery';

        const itemsHtml = (order.items || []).map(item => {
            const itemName = item.name || item.foodId?.name || item.variant?.name || 'Food Item';
            const qty = item.quantity || 1;
            const price = Number(item.price || item.unitPrice || 0).toLocaleString();
            return `<tr>
                <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; font-weight: 600; color: #1e293b;">${itemName}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; text-align: center; color: #64748b;">x${qty}</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; text-align: right; font-weight: 700; color: #ea580c;">₦${price}</td>
            </tr>`;
        }).join('');

        const adminOrderUrl = `${process.env.ADMIN_URL || 'https://admin.melachow.com'}/admin/orders/${order._id}`;

        const htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; padding: 30px 15px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
                <div style="background-color: #ea580c; padding: 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase;">🛒 New Order Placed — Super Admin Alert</h1>
                </div>
                <div style="padding: 28px; color: #334155;">
                    <div style="background-color: #fff7ed; border-left: 4px solid #ea580c; padding: 14px 18px; border-radius: 8px; margin-bottom: 24px;">
                        <span style="display: block; font-size: 11px; font-weight: 800; color: #c2410c; text-transform: uppercase; letter-spacing: 1px;">Order Reference</span>
                        <span style="font-size: 20px; font-weight: 900; color: #0f172a;">#${orderCode}</span>
                    </div>

                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                        <tr>
                            <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600;">Customer:</td>
                            <td style="padding: 6px 0; font-size: 13px; font-weight: 700; color: #0f172a; text-align: right;">${customerName} (${customerPhone})</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600;">Vendor(s):</td>
                            <td style="padding: 6px 0; font-size: 13px; font-weight: 700; color: #0f172a; text-align: right;">${restaurantNames || vendorContacts || 'Vendor Partners'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600;">Total Paid:</td>
                            <td style="padding: 6px 0; font-size: 16px; font-weight: 900; color: #16a34a; text-align: right;">₦${totalAmount}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600;">Delivery Address:</td>
                            <td style="padding: 6px 0; font-size: 13px; font-weight: 600; color: #475569; text-align: right;">${addressText}</td>
                        </tr>
                    </table>

                    <h3 style="font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a; margin-bottom: 12px;">Order Summary</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 28px; background-color: #f8fafc; border-radius: 8px; overflow: hidden;">
                        <thead>
                            <tr style="background-color: #f1f5f9; text-align: left;">
                                <th style="padding: 8px 12px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase;">Item</th>
                                <th style="padding: 8px 12px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; text-align: center;">Qty</th>
                                <th style="padding: 8px 12px; font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; text-align: right;">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml}
                        </tbody>
                    </table>

                    <div style="text-align: center;">
                        <a href="${adminOrderUrl}" style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 14px 28px; border-radius: 12px; font-size: 13px; font-weight: 800; text-decoration: none; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 12px rgba(15,23,42,0.15);">Open Live Order Desk →</a>
                    </div>
                </div>
                <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8; font-weight: 600;">
                    © ${new Date().getFullYear()} MelaChow Platform Administration.
                </div>
            </div>
        </div>
        `;

        for (const recipient of adminEmails) {
            sendMail({
                to: recipient,
                subject: `🛒 New Order #${orderCode} — ₦${totalAmount} (${restaurantNames || 'MelaChow'})`,
                html: htmlContent
            }).catch(e => console.error(`[sendSuperAdminOrderEmail] Failed sending to ${recipient}:`, e.message));
        }

        console.log(`[sendSuperAdminOrderEmail] ✉️ Order notification email queued for ${adminEmails.length} super-admin email(s)`);

    } catch (err) {
        console.error('[sendSuperAdminOrderEmail] Error sending super-admin email:', err.message);
    }
}
