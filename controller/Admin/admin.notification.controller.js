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
        // Admins might want to see all system notifications or just admin-specific ones
        const notifications = await Notification.find({ type: { $in: ['system', 'account_update'] } })
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({ success: true, notifications });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch admin notifications', error: error.message });
    }
};
