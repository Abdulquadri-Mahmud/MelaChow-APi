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

// Push subscription routes must be registered before /:id.
router.get('/vapid-public-key', requireRiderAuth, getVapidPublicKey);
router.post('/subscribe', requireRiderAuth, subscribeRider);
router.post('/unsubscribe', requireRiderAuth, (req, res) => res.json({ success: true })); // Simple stub

// Clear all
router.delete('/clear-all', requireRiderAuth, clearAllRiderNotifications);

// Get unread notification count (alias for SocketContext consistency)
router.get('/unread-count', requireRiderAuth, getUnreadRiderCount);

// Get unread notification count
router.get('/unread', requireRiderAuth, getUnreadRiderCount);

// Fetch rider notifications (alias for SocketContext consistency)
router.get('/history', requireRiderAuth, getRiderNotifications);

// Fetch rider notifications
router.get('/', requireRiderAuth, getRiderNotifications);

// Get a single notification and mark it as read
router.get('/:id', requireRiderAuth, getSingleRiderNotification);

// Interactively mark as read
router.patch('/:id/read', requireRiderAuth, markRiderNotificationAsRead);

export default router;
