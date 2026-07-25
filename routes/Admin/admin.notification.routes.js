import express from 'express';
import {
    subscribeAdmin,
    getAdminNotifications,
    getAdminUnreadCount,
    markAdminAsRead,
    markAllAdminAsRead,
    deleteAdminNotification,
    unsubscribeAdmin
} from '../../controller/Admin/admin.notification.controller.js';
import { getVapidPublicKey } from '../../controller/notification/notification.controller.js';
import { adminAuth } from '../../middleware/adminAuth.js';

const router = express.Router();

// VAPID public key is intentionally unauthenticated – it is a public key
router.get('/vapid-public-key', getVapidPublicKey);
router.post('/subscribe', adminAuth, subscribeAdmin);
router.post('/unsubscribe', adminAuth, unsubscribeAdmin);
router.get('/', adminAuth, getAdminNotifications);
router.get('/history', adminAuth, getAdminNotifications);
router.get('/unread-count', adminAuth, getAdminUnreadCount);
router.patch('/:id/read', adminAuth, markAdminAsRead);
router.patch('/read-all', adminAuth, markAllAdminAsRead);
router.delete('/:id', adminAuth, deleteAdminNotification);

export default router;
