import express from 'express';
import {
    getRiderNotifications,
    getSingleRiderNotification,
    getUnreadRiderCount,
    markRiderNotificationAsRead,
    clearAllRiderNotifications
} from '../controller/notification/riderNotification.controller.js';
import { requireRiderAuth } from '../middleware/riderAuth.middleware.js';

const router = express.Router();

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

export default router;
