import express from 'express';
import {
    subscribeToNotifications,
    unsubscribeFromNotifications,
    getVapidPublicKey,
    sendTestNotification
} from '../controller/notification/notification.controller.js';
import auth from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/vapid-public-key', getVapidPublicKey);
router.post('/subscribe', auth, subscribeToNotifications);
router.post('/unsubscribe', auth, unsubscribeFromNotifications); // Keep POST for compatibility if needed
router.delete('/unsubscribe', auth, unsubscribeFromNotifications); // Add DELETE
router.post('/test', auth, sendTestNotification);

export default router;
