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
            'vendor_rider_assigned',
            'admin_order_ready',
            'admin_order_delivered',
            'rider_assignment_needed',
            'rider_assignment_accepted',
            'rider_assignment_timeout',
            'vendor_review',
            'support_ticket',
            'system',
            'promo',
            'discount',
            'delivery_nearby',
            'account_update',
            'general',
            // ── Delivery System Overhaul types ────────────────────────────────
            'order_remake_request',         // Vendor: remake window after disputed delivery
            'rider_terminated_reassigning', // Customer: rider terminated, finding new one
            'rider_timeout_reassigning',    // Customer: watchdog reset, finding new rider
            'delivery_timed_out',           // Rider: watchdog timed out their delivery
            'dispute_escalation_admin',     // Admin: 15-min remake window expired, needs review
            'vendor_order_timeout',         // Vendor: auto-cancel timeout notification
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
