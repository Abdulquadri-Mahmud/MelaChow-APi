import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
        index: true
    },
    riderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Rider',
        required: false,
        index: true
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
            'order_assigned',        // ✅ FIX: was missing — caused silent DB failure for rider assignment notifications
            'rider_order_rejected',  // ✅ FIX: added for completeness
            'vendor_new_order',
            'vendor_order_cancelled',
            'promo',
            'discount',
            'delivery_nearby',
            'account_update',
            'general'
        ],
        default: 'general',
        index: true
    },
    orderId: {
        type: String,
        sparse: true
    },
    restaurantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vendor',
        index: true
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
        index: true
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
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ riderId: 1, read: 1 });
notificationSchema.index({ userId: 1, type: 1 });
notificationSchema.index({ riderId: 1, type: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;