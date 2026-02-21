import express from 'express';
import {
    subscribeVendor,
    unsubscribeVendor,
    getVendorNotifications
} from '../../controller/vendor/vendor.notification.controller.js';
import authVendor from '../../middleware/vendor.middleware.js';

const router = express.Router();

router.post('/subscribe', authVendor, subscribeVendor);
router.post('/unsubscribe', authVendor, unsubscribeVendor);
router.get('/history', authVendor, getVendorNotifications);

export default router;
