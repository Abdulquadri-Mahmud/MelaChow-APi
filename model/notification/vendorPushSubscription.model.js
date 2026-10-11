import mongoose from 'mongoose';

const vendorPushSubscriptionSchema = new mongoose.Schema({
    vendorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vendor',
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

// Ensure a vendor can have multiple subscriptions but avoid duplicate endpoints for same vendor
vendorPushSubscriptionSchema.index({ 'subscription.endpoint': 1 }, { unique: true });
vendorPushSubscriptionSchema.index({ vendorId: 1 });

const VendorPushSubscription = mongoose.model('VendorPushSubscription', vendorPushSubscriptionSchema);

export default VendorPushSubscription;
