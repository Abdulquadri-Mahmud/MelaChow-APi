import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    subscription: {
        endpoint: { type: String, required: true },
        provider: { type: String, default: 'web' },
        fcmToken: { type: String },
        platform: { type: String },
        deviceId: { type: String },
        expirationTime: { type: Number, default: null },
        keys: {
            p256dh: { type: String, required: function () { return this.subscription?.provider !== 'firebase'; } },
            auth: { type: String, required: function () { return this.subscription?.provider !== 'firebase'; } }
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

// Ensure a user can have multiple subscriptions (multiple devices)
// but avoid duplicate endpoints for the same user
pushSubscriptionSchema.index({ 'subscription.endpoint': 1 }, { unique: true });
pushSubscriptionSchema.index({ userId: 1 });

const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);

export default PushSubscription;
