import express from 'express';
import {
    getRiderNotifications,
    getSingleRiderNotification,
    getUnreadRiderCount,
    markRiderNotificationAsRead,
    clearAllRiderNotifications,
    getVapidPublicKey,
    subscribeRider
} from '../controller/notification/riderNotification.controller.js';
import { requireRiderAuth } from '../middleware/riderAuth.middleware.js';

const router = express.Router();

// Fetch rider notifications (alias for SocketContext consistency)
router.get('/history', requireRiderAuth, getRiderNotifications);

// Get unread notification count (alias for SocketContext consistency)
router.get('/unread-count', requireRiderAuth, getUnreadRiderCount);

// Fetch rider notifications
router.get('/', requireRiderAuth, getRiderNotifications);

// Get unread notification count
router.get('/unread', requireRiderAuth, getUnreadRiderCount);

// Get a single notification and mark it as read
router.get('/:id', requireRiderAuth, getSingleRiderNotification);

// Interactively mark as read
router.patch('/:id/read', requireRiderAuth, markRiderNotificationAsRead);

// Clear all
router.delete('/clear-all', requireRiderAuth, clearAllRiderNotifications);

// Push subscription
router.get('/vapid-public-key', requireRiderAuth, getVapidPublicKey);
router.post('/subscribe', requireRiderAuth, subscribeRider);
router.post('/unsubscribe', requireRiderAuth, (req, res) => res.json({ success: true })); // Simple stub

export default router;
