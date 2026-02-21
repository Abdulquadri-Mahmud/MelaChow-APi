import AdminPushSubscription from '../../model/notification/adminPushSubscription.model.js';
import Notification from '../../model/notification/notification.model.js';

export const subscribeAdmin = async (req, res) => {
    try {
        const { subscription, deviceType } = req.body;
        const adminId = req.admin._id;

        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return res.status(400).json({ message: 'Invalid subscription object' });
        }

        await AdminPushSubscription.findOneAndUpdate(
            { 'subscription.endpoint': subscription.endpoint },
            { adminId, subscription, deviceType },
            { upsert: true, new: true }
        );

        res.status(201).json({ message: 'Admin subscribed successfully' });
    } catch (error) {
        console.error('Admin Subscribe Error:', error);
        res.status(500).json({ message: 'Failed to subscribe admin', error: error.message });
    }
};

export const getAdminNotifications = async (req, res) => {
    try {
        const { limit = 50, skip = 0, type, unread } = req.query;
        const adminId = req.admin._id;

        // Build query
        // Admins can see specific admin notifications OR general system notifications
        let query = {
            $or: [
                { adminId: adminId },
                { type: { $in: ['system', 'account_update', 'vendor_review'] } }
            ]
        };

        if (type && type !== 'all') {
            query.type = type;
        }

        if (unread === 'true') {
            query.read = false;
        }

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));

        const unreadCount = await Notification.countDocuments({
            $or: [
                { adminId: adminId },
                { type: { $in: ['system', 'account_update', 'vendor_review'] } }
            ],
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
        res.status(500).json({ message: 'Failed to fetch admin notifications', error: error.message });
    }
};

/**
 * Get count of unread admin notifications
 */
export const getAdminUnreadCount = async (req, res) => {
    try {
        const adminId = req.admin._id;
        const count = await Notification.countDocuments({
            $or: [
                { adminId: adminId },
                { type: { $in: ['system', 'account_update', 'vendor_review'] } }
            ],
            read: false
        });

        res.json({ success: true, count });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to get unread count', error: error.message });
    }
};

/**
 * Mark single admin notification as read
 */
export const markAdminAsRead = async (req, res) => {
    try {
        const adminId = req.admin._id;
        const notification = await Notification.findOneAndUpdate(
            {
                _id: req.params.id,
                $or: [
                    { adminId: adminId },
                    { type: { $in: ['system', 'account_update', 'vendor_review'] } }
                ]
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
 * Mark all admin notifications as read
 */
export const markAllAdminAsRead = async (req, res) => {
    try {
        const adminId = req.admin._id;
        const result = await Notification.updateMany(
            {
                $or: [
                    { adminId: adminId },
                    { type: { $in: ['system', 'account_update', 'vendor_review'] } }
                ],
                read: false
            },
            { read: true }
        );

        res.json({
            success: true,
            message: 'All admin notifications marked as read',
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update notifications', error: error.message });
    }
};

/**
 * Delete a single admin notification
 */
export const deleteAdminNotification = async (req, res) => {
    try {
        const adminId = req.admin._id;
        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            $or: [
                { adminId: adminId },
                { type: { $in: ['system', 'account_update', 'vendor_review'] } }
            ]
        });

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete notification', error: error.message });
    }
};
