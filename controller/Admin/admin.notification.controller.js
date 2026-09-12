import AdminPushSubscription from '../../model/notification/adminPushSubscription.model.js';
import Notification from '../../model/notification/notification.model.js';
import { usePostgresNotificationWrites } from '../../services/postgres/compat.js';
import { notificationRepository } from '../../services/postgres/notification.repository.js';

export const subscribeAdmin = async (req, res) => {
    try {
        const { subscription, deviceType } = req.body;
        const adminId = req.admin._id;

        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return res.status(400).json({ message: 'Invalid subscription object' });
        }
        if(usePostgresNotificationWrites()){await notificationRepository.saveSubscription('admin',adminId,subscription,deviceType,req.headers['user-agent']);return res.status(201).json({message:'Admin subscribed successfully'});}

        await AdminPushSubscription.findOneAndUpdate(
            { 'subscription.endpoint': subscription.endpoint },
            { adminId, subscription, deviceType },
            { upsert: true, new: true }
        );

        res.status(201).json({ message: 'Admin subscribed successfully' });
    } catch (error) {
        console.error('Admin Subscribe Error:', error);
        res.status(500).json({ message: 'Failed to subscribe admin', error: error.message });
    }
};

export const unsubscribeAdmin = async (req, res) => {
    try {
        const { endpoint } = req.body;
        if (!endpoint) return res.status(400).json({ message: 'Endpoint is required' });
        if(usePostgresNotificationWrites()){await notificationRepository.removeSubscription('admin',req.admin._id,endpoint);return res.json({success:true,message:'Admin unsubscribed'});}

        await AdminPushSubscription.findOneAndDelete({
            adminId: req.admin._id,
            'subscription.endpoint': endpoint
        });

        res.json({ success: true, message: 'Admin unsubscribed' });
    } catch (error) {
        console.error('Admin Unsubscribe Error:', error);
        res.status(500).json({ message: 'Failed to unsubscribe admin', error: error.message });
    }
};

export const getAdminNotifications = async (req, res) => {
    try {
        const { limit = 50, skip = 0, type, unread } = req.query;
        const adminId = req.admin._id;
        if(usePostgresNotificationWrites()){const result=await notificationRepository.list('admin',adminId,{limit,skip,type,unread});const unreadCount=await notificationRepository.unreadCount('admin',adminId);return res.json({success:true,...result,unreadCount,hasMore:result.total>Number(skip)+result.notifications.length});}

        // Build query — Admins see notifications where role is 'admin' (broadcasts)
        // OR notifications specifically targeted to their adminId.
        let query = {
            $or: [
                { role: 'admin' },
                { adminId: adminId }
            ]
        };

        if (type && type !== 'all') {
            query.type = type;
        }

        if (unread === 'true') {
            query.read = false;
        }

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));

        // Unread count for the specific admin + broadcast notifications
        const unreadCount = await Notification.countDocuments({
            $or: [
                { role: 'admin' },
                { adminId: adminId }
            ],
            read: false
        });

        const total = await Notification.countDocuments(query);

        res.json({
            success: true,
            notifications,
            unreadCount,
            total,
            hasMore: total > (parseInt(skip) + notifications.length)
        });
    } catch (error) {
        console.error('getAdminNotifications Error:', error);
        res.status(500).json({ message: 'Failed to fetch admin notifications', error: error.message });
    }
};

/**
 * Get count of unread admin notifications
 */
export const getAdminUnreadCount = async (req, res) => {
    try {
        const adminId = req.admin._id;
        if(usePostgresNotificationWrites())return res.json({success:true,count:await notificationRepository.unreadCount('admin',adminId)});
        const count = await Notification.countDocuments({
            $or: [
                { role: 'admin' },
                { adminId: adminId }
            ],
            read: false
        });

        res.json({ success: true, count });
    } catch (error) {
        console.error('getAdminUnreadCount Error:', error);
        res.status(500).json({ success: false, message: 'Failed to get unread count', error: error.message });
    }
};

/**
 * Mark single admin notification as read
 */
export const markAdminAsRead = async (req, res) => {
    try {
        const adminId = req.admin._id;
        if(usePostgresNotificationWrites()){const notification=await notificationRepository.markRead('admin',adminId,req.params.id);if(!notification)return res.status(404).json({success:false,message:'Notification not found'});return res.json({success:true,notification});}
        const notification = await Notification.findOneAndUpdate(
            {
                _id: req.params.id,
                $or: [
                    { role: 'admin' },
                    { adminId: adminId }
                ]
            },
            { read: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.json({ success: true, notification });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update notification', error: error.message });
    }
};

/**
 * Mark all admin notifications as read
 */
export const markAllAdminAsRead = async (req, res) => {
    try {
        const adminId = req.admin._id;
        if(usePostgresNotificationWrites()){const modifiedCount=await notificationRepository.markAllRead('admin',adminId);return res.json({success:true,message:'All admin notifications marked as read',modifiedCount});}
        const result = await Notification.updateMany(
            {
                $or: [
                    { role: 'admin' },
                    { adminId: adminId }
                ],
                read: false
            },
            { read: true }
        );

        res.json({
            success: true,
            message: 'All admin notifications marked as read',
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update notifications', error: error.message });
    }
};

/**
 * Delete a single admin notification
 */
export const deleteAdminNotification = async (req, res) => {
    try {
        const adminId = req.admin._id;
        if(usePostgresNotificationWrites()){const deletedCount=await notificationRepository.remove('admin',adminId,req.params.id);if(!deletedCount)return res.status(404).json({success:false,message:'Notification not found'});return res.json({success:true,message:'Notification deleted'});}
        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            $or: [
                { adminId: adminId },
                { type: { $in: ['system', 'account_update', 'vendor_review'] } }
            ]
        });

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }

        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete notification', error: error.message });
    }
};
