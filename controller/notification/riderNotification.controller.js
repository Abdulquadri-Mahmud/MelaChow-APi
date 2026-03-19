import Notification from "../../model/notification/notification.model.js";

/**
 * Get rider's notification history
 */
export const getRiderNotifications = async (req, res) => {
    try {
        const { limit = 100, skip = 0, unread } = req.query;

        // Build query for this specific rider
        let query = { riderId: req.rider._id };

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
        console.error('Fetch rider notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notifications',
            error: error.message
        });
    }
};

/**
 * Get count of unread rider notifications
 */
export const getUnreadRiderCount = async (req, res) => {
    try {
        const count = await Notification.countDocuments({
            riderId: req.rider._id,
            read: false
        });

        res.json({ success: true, count });

    } catch (error) {
        console.error('Unread rider count error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get unread count',
            error: error.message
        });
    }
};

/**
 * Get single rider notification and mark it as read
 */
export const getSingleRiderNotification = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            {
                _id: req.params.id,
                riderId: req.rider._id
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

        res.json({ success: true, notification });

    } catch (error) {
        console.error('Get single rider notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notification',
            error: error.message
        });
    }
};

/**
 * Mark single rider notification as read
 */
export const markRiderNotificationAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            {
                _id: req.params.id,
                riderId: req.rider._id
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

        res.json({ success: true, notification });

    } catch (error) {
        console.error('Mark rider notification as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update notification',
            error: error.message
        });
    }
};

/**
 * Delete all rider's notifications
 */
export const clearAllRiderNotifications = async (req, res) => {
    try {
        const result = await Notification.deleteMany({
            riderId: req.rider._id
        });

        res.json({
            success: true,
            message: 'All notifications cleared',
            deletedCount: result.deletedCount
        });

    } catch (error) {
        console.error('Clear all rider notifications error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear notifications',
            error: error.message
        });
    }
};

/**
 * Get VAPID public key for push notifications
 */
export const getVapidPublicKey = async (req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
};

/**
 * Subscribe rider to push notifications
 */
export const subscribeRider = async (req, res, next) => {
    try {
        const { subscription, deviceType } = req.body;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ success: false, message: "Subscription is required" });
        }

        const RiderPushSubscription = (await import("../../model/notification/riderPushSubscription.model.js")).default;

        await RiderPushSubscription.findOneAndUpdate(
            { 'subscription.endpoint': subscription.endpoint },
            {
                riderId: req.rider._id,
                subscription,
                deviceType: deviceType || 'web',
                userAgent: req.headers['user-agent'],
                lastUsed: new Date()
            },
            { upsert: true, new: true }
        );

        res.status(200).json({ success: true, message: "Subscribed to push notifications" });
    } catch (error) {
        next(error);
    }
};
