import express from 'express';
import {
    subscribeToNotifications,
    unsubscribeFromNotifications,
    getVapidPublicKey,
    sendTestNotification,
    getNotificationHistory,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications
} from '../controller/notification/notification.controller.js';
import auth from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/vapid-public-key', getVapidPublicKey);
router.post('/subscribe', auth, subscribeToNotifications);
router.post('/unsubscribe', auth, unsubscribeFromNotifications);
router.delete('/unsubscribe', auth, unsubscribeFromNotifications);
router.post('/test', auth, sendTestNotification);

// History and Management Routes
router.get('/history', auth, getNotificationHistory);
router.get('/unread-count', auth, getUnreadCount);
router.patch('/:id/read', auth, markAsRead);
router.patch('/read-all', auth, markAllAsRead);
router.delete('/clear-all', auth, clearAllNotifications);
router.delete('/:id', auth, deleteNotification);

export default router;
