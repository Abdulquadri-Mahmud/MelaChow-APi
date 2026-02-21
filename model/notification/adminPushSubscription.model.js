import mongoose from 'mongoose';

const adminPushSubscriptionSchema = new mongoose.Schema({
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },
    subscription: {
        endpoint: { type: String, required: true },
        expirationTime: { type: Number, default: null },
        keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true }
        }
    },
    deviceType: {
        type: String,
        enum: ['mobile', 'desktop', 'tablet', 'unknown'],
        default: 'unknown'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Unique endpoint across admins
adminPushSubscriptionSchema.index({ 'subscription.endpoint': 1 }, { unique: true });
adminPushSubscriptionSchema.index({ adminId: 1 });

const AdminPushSubscription = mongoose.model('AdminPushSubscription', adminPushSubscriptionSchema);

export default AdminPushSubscription;
