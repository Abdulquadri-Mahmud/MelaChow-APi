import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
    },
    riderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Rider',
        required: false,
    },
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: false,
    },
    role: {
        type: String,
        enum: ['user', 'vendor', 'admin', 'rider'],
        required: true,
        default: 'user',
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    body: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: [
            'order_placed',
            'order_confirmed',
            'order_preparing',
            'order_ready',
            'order_dispatched',
            'order_delivered',
            'order_cancelled',
            'order_assigned',
            'rider_order_rejected',
            'vendor_new_order',
            'vendor_order_cancelled',
            'admin_order_ready',      // ✅ New Admin Type
            'admin_order_delivered',  // ✅ New Admin Type
            'rider_assignment_needed', // ✅ New Admin Type
            'vendor_review',           // ✅ New Admin Type
            'system',                  // ✅ New Admin Type
            'promo',
            'discount',
            'delivery_nearby',
            'account_update',
            'general'
        ],
        default: 'general',
    },
    orderId: {
        type: String,
        sparse: true
    },
    restaurantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vendor',
    },
    url: {
        type: String,
        trim: true
    },
    image: {
        type: String,
        trim: true
    },
    icon: {
        type: String,
        trim: true
    },
    read: {
        type: Boolean,
        default: false,
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ riderId: 1, createdAt: -1 });
notificationSchema.index({ adminId: 1, createdAt: -1 });
notificationSchema.index({ role: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ riderId: 1, read: 1 });
notificationSchema.index({ userId: 1, type: 1 });
notificationSchema.index({ riderId: 1, type: 1 });

// Vendor notification history — missed_notifications query on reconnect
notificationSchema.index({ restaurantId: 1, createdAt: -1 });

// Vendor unread count — used by notification badge on vendor dashboard
notificationSchema.index({ restaurantId: 1, read: 1 });

notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;