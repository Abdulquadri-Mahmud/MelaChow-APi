import VendorPushSubscription from '../../model/notification/vendorPushSubscription.model.js';
import Notification from '../../model/notification/notification.model.js';

export const subscribeVendor = async (req, res) => {
    try {
        const { subscription, deviceType } = req.body;
        const vendorId = req.vendor._id;

        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return res.status(400).json({ message: 'Invalid subscription object' });
        }

        await VendorPushSubscription.findOneAndUpdate(
            { 'subscription.endpoint': subscription.endpoint },
            { vendorId, subscription, deviceType },
            { upsert: true, new: true }
        );

        res.status(201).json({ message: 'Vendor subscribed successfully' });
    } catch (error) {
        console.error('Vendor Subscribe Error:', error);
        res.status(500).json({ message: 'Failed to subscribe vendor', error: error.message });
    }
};

export const unsubscribeVendor = async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (!endpoint) return res.status(400).json({ message: 'Endpoint is required' });

        await VendorPushSubscription.findOneAndDelete({
            vendorId: req.vendor._id,
            'subscription.endpoint': endpoint
        });

        res.json({ success: true, message: 'Vendor unsubscribed' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to unsubscribe vendor', error: error.message });
    }
};

export const getVendorNotifications = async (req, res) => {
    try {
        const { limit = 50, skip = 0, type, unread } = req.query;
        const vendorId = req.vendor._id;

        // Build query
        let query = { restaurantId: vendorId };

        if (type && type !== 'all') {
            if (type === 'orders') {
                query.type = { $regex: 'order_', $options: 'i' };
            } else if (type === 'system') {
                query.type = { $in: ['system', 'account_update'] };
            } else {
                query.type = type;
            }
        }

        if (unread === 'true') {
            query.read = false;
        }

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));

        const unreadCount = await Notification.countDocuments({
            restaurantId: vendorId,
            read: false
        });

        const total = await Notification.countDocuments(query);

        res.json({
            success: true,
            notifications,
            unreadCount,
            total,
            hasMore: total > (parseInt(skip) + notifications.length)
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch messages', error: error.message });
    }
};

/**
 * Get count of unread vendor notifications
 */
export const getVendorUnreadCount = async (req, res) => {
    try {
        const vendorId = req.vendor._id;
        const count = await Notification.countDocuments({
            restaurantId: vendorId,
            read: false
        });

        res.json({ success: true, count });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to get unread count', error: error.message });
    }
};

/**
 * Mark single vendor notification as read
 */
export const markVendorAsRead = async (req, res) => {
    try {
        const vendorId = req.vendor._id;
        const notification = await Notification.findOneAndUpdate(
            {
                _id: req.params.id,
                restaurantId: vendorId
            },
            { read: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.json({ success: true, notification });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update notification', error: error.message });
    }
};

/**
 * Mark all vendor notifications as read
 */
export const markAllVendorAsRead = async (req, res) => {
    try {
        const vendorId = req.vendor._id;
        const result = await Notification.updateMany(
            { restaurantId: vendorId, read: false },
            { read: true }
        );

        res.json({
            success: true,
            message: 'All vendor notifications marked as read',
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update notifications', error: error.message });
    }
};

/**
 * Delete a single vendor notification
 */
export const deleteVendorNotification = async (req, res) => {
    try {
        const vendorId = req.vendor._id;
        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            restaurantId: vendorId
        });

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete notification', error: error.message });
    }
};
