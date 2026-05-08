import mongoose from "mongoose";

const riderAssignmentSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            required: true,
            index: true,
        },
        vendorOrderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "VendorOrder",
            default: null,
            index: true,
        },
        riderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Rider",
            required: true,
            index: true,
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            default: null,
            index: true,
        },
        stateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "State",
            default: null,
            index: true,
        },
        cityId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "City",
            default: null,
            index: true,
        },
        status: {
            type: String,
            enum: ["assigned", "accepted", "rejected", "timeout", "picked_up", "delivered", "cancelled"],
            default: "assigned",
            index: true,
        },
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            default: null,
        },
        assignedAt: { type: Date, default: Date.now },
        respondedAt: { type: Date, default: null },
        expiresAt: { type: Date, required: true, index: true },
        reason: { type: String, default: "" },
        metadata: { type: Object, default: {} },
    },
    { timestamps: true }
);

riderAssignmentSchema.index({ orderId: 1, status: 1, createdAt: -1 });
riderAssignmentSchema.index({ riderId: 1, status: 1, createdAt: -1 });
riderAssignmentSchema.index(
    { riderId: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: "assigned" } }
);

export default mongoose.models.RiderAssignment || mongoose.model("RiderAssignment", riderAssignmentSchema);
