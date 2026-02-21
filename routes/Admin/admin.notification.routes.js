import express from 'express';
import {
    subscribeAdmin,
    getAdminNotifications
} from '../../controller/Admin/admin.notification.controller.js';
import { adminAuth } from '../../middleware/adminAuth.js';

const router = express.Router();

router.post('/subscribe', adminAuth, subscribeAdmin);
router.get('/history', adminAuth, getAdminNotifications);

export default router;
