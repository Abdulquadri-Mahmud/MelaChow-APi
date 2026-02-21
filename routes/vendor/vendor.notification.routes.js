import express from 'express';
import {
    subscribeVendor,
    unsubscribeVendor,
    getVendorNotifications,
    getVendorUnreadCount,
    markVendorAsRead,
    markAllVendorAsRead,
    deleteVendorNotification
} from '../../controller/vendor/vendor.notification.controller.js';
import authVendor from '../../middleware/vendor.middleware.js';

const router = express.Router();

router.post('/subscribe', authVendor, subscribeVendor);
router.post('/unsubscribe', authVendor, unsubscribeVendor);
router.get('/history', authVendor, getVendorNotifications);
router.get('/unread-count', authVendor, getVendorUnreadCount);
router.patch('/:id/read', authVendor, markVendorAsRead);
router.patch('/read-all', authVendor, markAllVendorAsRead);
router.delete('/:id', authVendor, deleteVendorNotification);

export default router;
