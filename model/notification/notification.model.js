import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true // Index for fast queries by user
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
        sparse: true // Only index non-null values
    },
    url: {
        type: String, // Deep link URL for navigation
        trim: true
    },
    image: {
        type: String, // Optional banner image URL
        trim: true
    },
    icon: {
        type: String, // Custom icon URL
        trim: true
    },
    read: {
        type: Boolean,
        default: false,
        index: true // Index for filtering unread notifications
    },
    data: {
        type: mongoose.Schema.Types.Mixed, // Additional custom data
        default: {}
    }
}, {
    timestamps: true // Adds createdAt and updatedAt
});

// Compound indexes for efficient queries
notificationSchema.index({ userId: 1, createdAt: -1 }); // Get user's notifications sorted by date
notificationSchema.index({ userId: 1, read: 1 }); // Filter by read/unread status
notificationSchema.index({ userId: 1, type: 1 }); // Filter by notification type

// Auto-delete notifications older than 90 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
