import mongoose from 'mongoose';

const riderPushSubscriptionSchema = new mongoose.Schema({
    riderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Rider',
        required: true,
        index: true
    },
    subscription: {
        endpoint: { type: String, required: true },
        keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true }
        }
    },
    deviceType: {
        type: String,
        default: 'unknown'
    },
    userAgent: String,
    lastUsed: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Ensure a single device/endpoint isn't registered multiple times
riderPushSubscriptionSchema.index({ 'subscription.endpoint': 1 }, { unique: true });

const RiderPushSubscription = mongoose.model('RiderPushSubscription', riderPushSubscriptionSchema);

export default RiderPushSubscription;
