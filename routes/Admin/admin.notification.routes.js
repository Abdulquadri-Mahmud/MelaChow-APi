import express from 'express';
import {
    subscribeAdmin,
    getAdminNotifications,
    getAdminUnreadCount,
    markAdminAsRead,
    markAllAdminAsRead,
    deleteAdminNotification
} from '../../controller/Admin/admin.notification.controller.js';
import { adminAuth } from '../../middleware/adminAuth.js';

const router = express.Router();

router.post('/subscribe', adminAuth, subscribeAdmin);
router.get('/history', adminAuth, getAdminNotifications);
router.get('/unread-count', adminAuth, getAdminUnreadCount);
router.patch('/:id/read', adminAuth, markAdminAsRead);
router.patch('/read-all', adminAuth, markAllAdminAsRead);
router.delete('/:id', adminAuth, deleteAdminNotification);

export default router;
