// model/OrderBroadcastQueue.js
import mongoose from "mongoose";

const OrderBroadcastQueueSchema = new mongoose.Schema({
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        required: true,
    },
    vendorOrderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "VendorOrder",
        required: true,
        unique: true,   // one queue entry per vendor order
    },
    /**
     * "waiting"      — no riders available, queued
     * "broadcasting" — active broadcast in progress
     * "assigned"     — rider accepted, remove from queue
     * "cancelled"    — order cancelled while in queue
     */
    status: {
        type: String,
        enum: ["waiting", "broadcasting", "assigned", "cancelled"],
        default: "waiting",
        index: true,
    },
    queuedAt:      { type: Date, default: Date.now, index: true },
    attemptCount:  { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    cityId:        { type: mongoose.Schema.Types.ObjectId, ref: "City", index: true },
    stateId:       { type: mongoose.Schema.Types.ObjectId, ref: "State" },
}, { timestamps: true });

// Compound index for efficient FIFO dispatch per city
OrderBroadcastQueueSchema.index({ status: 1, cityId: 1, queuedAt: 1 });

export default mongoose.model("OrderBroadcastQueue", OrderBroadcastQueueSchema);
