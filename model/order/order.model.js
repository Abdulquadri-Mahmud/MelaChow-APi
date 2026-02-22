import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
    {
        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            required: true,
        },
        riderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Rider",
            default: null,
        },

        deliveryAddress: {
            addressLine: { type: String, required: true },
            cityName: { type: String, required: true },
            stateName: { type: String, required: true },
            cityId: { type: mongoose.Schema.Types.ObjectId, ref: "City" },
            stateId: { type: mongoose.Schema.Types.ObjectId, ref: "State" },
        },

        items: [
            {
                name: { type: String, required: true },
                quantity: { type: Number, required: true },
                price: { type: Number, required: true },
                itemId: { type: mongoose.Schema.Types.ObjectId, ref: "Food" }, // Assuming ref to Menu Item/Food
            },
        ],

        subtotal: { type: Number, required: true },
        deliveryFee: { type: Number, default: 0 },
        total: { type: Number, required: true },

        status: {
            type: String,
            enum: [
                "pending",
                "accepted",
                "preparing",
                "ready",
                "assigned",
                "picked_up",
                "delivered",
                "cancelled",
            ],
            default: "pending",
        },

        statusLog: [
            {
                status: { type: String, required: true },
                changedBy: {
                    type: String,
                    enum: ["customer", "vendor", "rider", "system"],
                    required: true,
                },
                timestamp: { type: Date, default: Date.now },
            },
        ],

        paymentStatus: {
            type: String,
            enum: ["unpaid", "paid", "refunded"],
            default: "unpaid",
        },

        paymentMethod: {
            type: String,
            enum: ["cash", "card", "transfer"],
            default: "cash",
        },

        note: { type: String },
    },
    { timestamps: true }
);

// We use "OrderSimple" or similar if "Order" already exists, 
// but the prompt is specific about "Order" model contents.
// To avoid conflict with existing model in mongoose:
const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);

export default Order;
