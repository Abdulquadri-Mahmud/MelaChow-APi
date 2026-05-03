import {
    sendNotification,
    saveSubscription,
    removeSubscription,
    syncUnreadCountToRedis
} from '../../services/notification.service.js';
import PushSubscription from '../../model/notification/pushSubscription.model.js';
import Notification from '../../model/notification/notification.model.js';

export const subscribeToNotifications = async (req, res) => {
    try {
        const { subscription, deviceType } = req.body;
        const userId = req.userId; // Middleware will provide this

        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return res.status(400).json({ message: 'Invalid subscription object' });
        }

        await saveSubscription(userId, subscription, deviceType);

        res.status(201).json({ message: 'Subscribed successfully' });
    } catch (error) {
        console.error('Subscribe Error:', error);
        res.status(500).json({ message: 'Failed to subscribe', error: error.message });
    }
};

export const unsubscribeFromNotifications = async (req, res) => {
    try {
        // Frontend now sends subscription object directly
        const subscription = req.body;
        const endpoint = subscription?.endpoint;

        if (!endpoint) {
            return res.status(400).json({
                message: 'Endpoint is required',
                received: subscription
            });
        }

        // Find and delete the subscription from database
        const deleted = await PushSubscription.findOneAndDelete({
            userId: req.userId,
            'subscription.endpoint': endpoint
        });

        if (!deleted) {
            return res.status(404).json({
                message: 'Subscription not found'
            });
        }

        res.json({
            success: true,
            message: 'Unsubscribed successfully'
        });

    } catch (error) {
        console.error('Unsubscribe error:', error);
        res.status(500).json({
            message: 'Failed to unsubscribe',
            error: error.message
        });
    }
};

export const getVapidPublicKey = (req, res) => {
    if (!process.env.VAPID_PUBLIC_KEY) {
        return res.status(503).json({
            success: false,
            message: 'Push notification key is not configured'
        });
    }

    res.status(200).json({ success: true, publicKey: process.env.VAPID_PUBLIC_KEY });
};

export const sendTestNotification = async (req, res) => {
    try {
        const userId = req.userId;
        await sendNotification(userId, 'promo', {
            message: 'This is a test notification from MelaChow!',
            url: '/profile'
        });
        res.status(200).json({ message: 'Test notification sent' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to send test notification', error: error.message });
    }
};

/**
 * Get user's notification history
 */
export const getNotificationHistory = async (req, res) => {
    try {
        const { limit = 100, skip = 0, type, unread } = req.query;

        // Build query
        let query = { userId: req.userId };

        // If restaurantId is provided, fetch notifications for that restaurant too
        // (Useful for vendors to see store-wide notifications)
        if (req.query.restaurantId) {
            query = {
                $or: [
                    { userId: req.userId },
                    { restaurantId: req.query.restaurantId }
                ]
            };
        }

        if (type && type !== 'all') {
            if (type === 'orders') {
                query.type = { $regex: 'order_', $options: 'i' };
            } else if (type === 'promos') {
                query.type = { $in: ['promo', 'discount'] };
            } else {
                query.type = type;
            }
        }

        if (unread === 'true') {
            query.read = false;
        }

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 }) // Newest first
            .limit(parseInt(limit))
            .skip(parseInt(skip))
            .lean();

        const total = await Notification.countDocuments(query);

        res.json({
            success: true,
            notifications,
            total,
            hasMore: total > (parseInt(skip) + notifications.length)
        });

    } catch (error) {
        console.error('Fetch notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notifications',
            error: error.message
        });
    }
};

/**
 * Get count of unread notifications
 */
export const getUnreadCount = async (req, res) => {
    try {
        const count = await Notification.countDocuments({
            userId: req.userId,
            read: false
        });

        res.json({ success: true, count });

    } catch (error) {
        console.error('Unread count error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get unread count',
            error: error.message
        });
    }
};

/**
 * Mark single notification as read
 */
export const markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            {
                _id: req.params.id,
                userId: req.userId // Ensure user owns this notification
            },
            { read: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        // Reconciliation with Redis counter
        await syncUnreadCountToRedis(req.userId);

        res.json({ success: true, notification });

    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update notification',
            error: error.message
        });
    }
};

/**
 * Mark all user's notifications as read
 */
export const markAllAsRead = async (req, res) => {
    try {
        const result = await Notification.updateMany(
            { userId: req.userId, read: false },
            { read: true }
        );

        // Reconciliation with Redis counter
        await syncUnreadCountToRedis(req.userId);

        res.json({
            success: true,
            message: 'All notifications marked as read',
            modifiedCount: result.modifiedCount
        });

    } catch (error) {
        console.error('Mark all as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update notifications',
            error: error.message
        });
    }
};

/**
 * Delete a single notification
 */
export const deleteNotification = async (req, res) => {
    try {
        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            userId: req.userId // Ensure user owns this notification
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        res.json({
            success: true,
            message: 'Notification deleted'
        });

    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete notification',
            error: error.message
        });
    }
};

/**
 * Delete all user's notifications
 */
export const clearAllNotifications = async (req, res) => {
    try {
        const result = await Notification.deleteMany({
            userId: req.userId
        });

        res.json({
            success: true,
            message: 'All notifications cleared',
            deletedCount: result.deletedCount
        });

    } catch (error) {
        console.error('Clear all error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear notifications',
            error: error.message
        });
    }
};

