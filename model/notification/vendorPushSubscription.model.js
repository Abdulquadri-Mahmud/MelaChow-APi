import mongoose from 'mongoose';

const vendorPushSubscriptionSchema = new mongoose.Schema({
    vendorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vendor',
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

// Ensure a vendor can have multiple subscriptions but avoid duplicate endpoints for same vendor
vendorPushSubscriptionSchema.index({ 'subscription.endpoint': 1 }, { unique: true });
vendorPushSubscriptionSchema.index({ vendorId: 1 });

const VendorPushSubscription = mongoose.model('VendorPushSubscription', vendorPushSubscriptionSchema);

export default VendorPushSubscription;
