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
        const { limit = 50, skip = 0 } = req.query;
        const vendorId = req.vendor._id;

        const notifications = await Notification.find({ restaurantId: vendorId })
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));

        const unreadCount = await Notification.countDocuments({
            restaurantId: vendorId,
            read: false
        });

        res.json({ success: true, notifications, unreadCount });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch messages', error: error.message });
    }
};
