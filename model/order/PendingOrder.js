import mongoose from "mongoose";

const pendingOrderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    paymentReference: {
        type: String,
        required: true,
        unique: true,
    },
    payload: {
        type: Object,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 86400, // Documents verify automatically delete after 24 hours (TTL)
    },
});

const PendingOrder = mongoose.model("PendingOrder", pendingOrderSchema);
export default PendingOrder;
