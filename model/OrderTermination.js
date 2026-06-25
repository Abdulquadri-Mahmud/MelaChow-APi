// model/OrderTermination.js
import mongoose from "mongoose";

const OrderTerminationSchema = new mongoose.Schema({
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        required: true,
        index: true,
    },
    vendorOrderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "VendorOrder",
        required: true,
    },
    previousRiderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Rider",
        required: true,
    },
    previousRiderName:  { type: String, required: true },
    previousRiderPhone: { type: String, required: true },

    /**
     * true  = rider already collected food from vendor.
     *         New rider must contact previous rider to collect the food physically.
     * false = food still at vendor. New rider goes to vendor as normal.
     */
    foodPickedUp: { type: Boolean, required: true, default: false },

    /**
     * "rider_initiated" — rider tapped Terminate in the app.
     * "system_timeout"  — 1-hour watchdog fired, no delivery confirmed.
     */
    reason: {
        type: String,
        enum: ["rider_initiated", "system_timeout"],
        required: true,
    },

    riderNote: { type: String, default: "" },

    /**
     * "pending"    — order re-broadcast, waiting for new rider
     * "reassigned" — new rider accepted
     * "disputed"   — spoiled/uncontactable, escalated to admin
     * "resolved"   — admin closed the case
     */
    status: {
        type: String,
        enum: ["pending", "reassigned", "disputed", "resolved"],
        default: "pending",
        index: true,
    },

    newRiderId:    { type: mongoose.Schema.Types.ObjectId, ref: "Rider", default: null },
    terminatedAt:  { type: Date, default: Date.now },
    resolvedAt:    { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model("OrderTermination", OrderTerminationSchema);
