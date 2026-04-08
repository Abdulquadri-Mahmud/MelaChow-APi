import webpush from 'web-push';
import PushSubscription from '../model/notification/pushSubscription.model.js';
import dotenv from 'dotenv';

dotenv.config();

class PushNotificationService {
    constructor() {
        this.isConfigured = false;
        this.initialize();
    }

    /**
     * Initialize VAPID details safely
     */
    initialize() {
        const publicKey = process.env.VAPID_PUBLIC_KEY;
        const privateKey = process.env.VAPID_PRIVATE_KEY;
        const email = process.env.VAPID_EMAIL || 'mailto:melachow001@gmail.com';

        console.log('Push Notification Service: Initializing...');

        if (!publicKey || !privateKey) {
            console.warn('[Push Service] MISSING VAPID KEYS in .env file.');
            console.warn('[Push Service] Push notifications will be DISABLED.');
            console.warn('Run "node scripts/generate-vapid-keys.js" to generate them.');
            this.isConfigured = false;
            return;
        }

        try {
            webpush.setVapidDetails(email, publicKey, privateKey);
            this.isConfigured = true;
            console.log('[Push Service] Configured successfully.');
        } catch (error) {
            console.error('[Push Service] Configuration failed:', error.message);
            this.isConfigured = false;
        }
    }

    /**
     * Send notification to a specific user
     */
    async sendToUser(userId, payload) {
        if (!this.isConfigured) {
            console.warn(`[Push Service] Skip sending notification to user ${userId} - Service not configured.`);
            return;
        }

        try {
            const subscriptions = await PushSubscription.find({ userId });

            if (!subscriptions || subscriptions.length === 0) {
                return;
            }

            const notificationPayload = JSON.stringify(payload);

            const sendPromises = subscriptions.map(sub =>
                webpush.sendNotification(sub.subscription, notificationPayload)
                    .catch(async (err) => {
                        if (err.statusCode === 410 || err.statusCode === 404) {
                            await PushSubscription.deleteOne({ _id: sub._id });
                        } else {
                            console.error(`[Push Service] Error for user ${userId}:`, err.message);
                        }
                    })
            );

            await Promise.allSettled(sendPromises);
        } catch (error) {
            console.error('[Push Service] error:', error);
        }
    }

    /**
     * Send order status update notification
     */
    async sendOrderStatusUpdate(userId, orderData) {
        if (!this.isConfigured) return;

        const { orderId, status, restaurantName } = orderData;

        const messages = {
            pending: 'Your order is pending confirmation.',
            accepted: `Your order from ${restaurantName} has been accepted!`,
            preparing: `Your order from ${restaurantName} is now being prepared.`,
            ready_for_pickup: `Your order from ${restaurantName} is ready for pickup!`,
            ready: `Your order from ${restaurantName} is ready!`,
            rider_assigned: 'A rider has been assigned to your order.',
            out_for_delivery: 'Your order is on the way!',
            delivered: 'Your order has been delivered. Enjoy!',
            completed: `Your order from ${restaurantName} has been completed.`,
            cancelled: `Your order from ${restaurantName} has been cancelled.`,
            failed: 'Your order has failed to process.',
            refunded: 'Your order has been refunded.'
        };

        const payload = {
            title: 'Order Update - MelaChow',
            body: messages[status] || `Your order status has been updated to ${status}.`,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/badge-72x72.png',
            data: {
                url: `/profile/orders/${orderId}`,
                orderId: orderId,
                status: status
            }
        };

        return this.sendToUser(userId, payload);
    }

    async saveSubscription(userId, subscription, deviceType = 'unknown') {
        return await PushSubscription.findOneAndUpdate(
            { 'subscription.endpoint': subscription.endpoint },
            { userId, subscription, deviceType },
            { upsert: true, new: true }
        );
    }

    async removeSubscription(endpoint) {
        return await PushSubscription.deleteOne({ 'subscription.endpoint': endpoint });
    }
}

export default new PushNotificationService();

