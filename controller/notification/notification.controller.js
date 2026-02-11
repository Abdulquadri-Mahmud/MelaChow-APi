import pushNotificationService from '../../services/pushNotificationService.js';

export const subscribeToNotifications = async (req, res) => {
    try {
        const { subscription, deviceType } = req.body;
        const userId = req.userId; // Middleware will provide this

        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return res.status(400).json({ message: 'Invalid subscription object' });
        }

        await pushNotificationService.saveSubscription(userId, subscription, deviceType);

        res.status(201).json({ message: 'Subscribed successfully' });
    } catch (error) {
        console.error('Subscribe Error:', error);
        res.status(500).json({ message: 'Failed to subscribe', error: error.message });
    }
};

export const unsubscribeFromNotifications = async (req, res) => {
    try {
        const { endpoint } = req.body;

        if (!endpoint) {
            return res.status(400).json({ message: 'Endpoint is required' });
        }

        await pushNotificationService.removeSubscription(endpoint);
        res.status(200).json({ message: 'Unsubscribed successfully' });
    } catch (error) {
        console.error('Unsubscribe Error:', error);
        res.status(500).json({ message: 'Failed to unsubscribe', error: error.message });
    }
};

export const getVapidPublicKey = (req, res) => {
    res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY });
};

export const sendTestNotification = async (req, res) => {
    try {
        const userId = req.userId;
        await pushNotificationService.sendToUser(userId, {
            title: 'GrubDash Test',
            body: 'This is a test push notification from GrubDash!',
            icon: '/icons/icon-192x192.png',
            data: { url: '/profile' }
        });
        res.status(200).json({ message: 'Test notification sent' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to send test notification', error: error.message });
    }
};
