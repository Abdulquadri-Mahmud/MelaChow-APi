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
import multiAuth from '../middleware/multiAuth.middleware.js';

const router = express.Router();

router.get('/vapid-public-key', getVapidPublicKey);
router.post('/subscribe', multiAuth, subscribeToNotifications);
router.post('/unsubscribe', multiAuth, unsubscribeFromNotifications);
router.delete('/unsubscribe', multiAuth, unsubscribeFromNotifications);
router.post('/test', multiAuth, sendTestNotification);

// History and Management Routes
router.get('/history', multiAuth, getNotificationHistory);
router.get('/unread-count', multiAuth, getUnreadCount);
router.patch('/:id/read', multiAuth, markAsRead);
router.patch('/read-all', multiAuth, markAllAsRead);
router.delete('/clear-all', multiAuth, clearAllNotifications);
router.delete('/:id', multiAuth, deleteNotification);

export default router;
