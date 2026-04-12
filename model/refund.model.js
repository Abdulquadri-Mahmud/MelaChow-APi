import mongoose from 'mongoose';

const refundSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            required: true,
            unique: true, // One refund per order — idempotency at schema level
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        originalTotal: {
            type: Number,
            required: true,
        },
        commissionRetained: {
            type: Number,
            default: 0,
        },
        reason: {
            type: String,
            enum: ['auto_cancel', 'vendor_cancel', 'admin_cancel', 'customer_cancel'],
            required: true,
        },
        orderStatusAtCancellation: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ['completed', 'failed', 'pending_wallet'],
            default: 'completed',
        },
        notes: {
            type: String,
            default: '',
        },
    },
    { timestamps: true }
);

refundSchema.index({ createdAt: -1 });
refundSchema.index({ userId: 1, createdAt: -1 });

const Refund = mongoose.model('Refund', refundSchema);
export default Refund;
