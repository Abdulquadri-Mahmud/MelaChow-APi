import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
    {
        // ✅ FIX: Renamed from `customerId` to `userId` to match what every other
        // file in the codebase reads (rider.service.js, order controller, socket events).
        // With `customerId`, order.userId returned undefined everywhere, meaning:
        //   - Customer socket room was "customer:undefined" → updates never arrived
        //   - sendOrderNotification(order.userId) sent notifications to nobody
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        // ✅ FIX: Made optional (no required: true) because multi-vendor orders
        // belong to multiple vendors. The per-vendor split is tracked in VendorOrder.
        // rider.service.js and the order controller never use order.vendorId directly.
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendor",
            required: false,
            default: null,
        },

        riderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Rider",
            default: null,
        },

        // ✅ FIX: Added orderId — the human-readable order reference (e.g. "ORD-A1B2C3").
        // Without this, wallet transaction descriptions read "Delivery fee from Order undefined"
        // and the payment reference lookup (Order.findOne({ paymentReference })) works but
        // the orderId returned to the frontend was undefined.
        orderId: {
            type: String,
            unique: true,
            sparse: true,
            index: true,
        },

        // ✅ FIX: Added paymentReference — required for Paystack webhook lookup.
        // Without this, Order.findOne({ paymentReference: reference }) always returns null,
        // causing verifyPayment to return 404 for every payment.
        paymentReference: {
            type: String,
            sparse: true,
            index: true,
        },

        deliveryAddress: {
            // ✅ FIX: Relaxed required constraints — address shape varies by frontend.
            // rider.service.js reads order.deliveryAddress.name and .phone for socket payload.
            addressLine: { type: String },
            cityName: { type: String },
            stateName: { type: String },
            cityId: { type: mongoose.Schema.Types.ObjectId, ref: "City" },
            stateId: { type: mongoose.Schema.Types.ObjectId, ref: "State" },
            // Fields read by rider controller for the assignment socket payload:
            name: { type: String },
            phone: { type: String },
            address: { type: String },     // used by RiderDashboard.jsx display
            coordinates: {
                lat: { type: Number },
                lng: { type: Number },
            },
        },

        items: [
            {
                // ✅ FIX: foodId replaces itemId — rider.service.js and the order controller
                // both reference item.foodId. itemId was silently returning undefined.
                foodId: { type: mongoose.Schema.Types.ObjectId, ref: "Food" },
                variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
                variant: { type: Object, default: {} },
                name: { type: String },
                quantity: { type: Number, required: true },
                price: { type: Number, required: true },
                // ✅ FIX: Added restaurantId per item — required for multi-vendor order
                // splitting in completeOrderFulfillment and for VendorOrder creation.
                restaurantId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Vendor",
                },
                metadata: { type: Object, default: {} },
            },
        ],

        subtotal: { type: Number, required: true, default: 0 },
        deliveryFee: { type: Number, default: 0 },
        total: { type: Number, required: true, default: 0 },

        // ✅ FIX: Added vendorDeliveryFees array — read by markDelivered in rider.service.js
        // to find the delivery fee to credit to the rider's wallet. Without this field,
        // order.vendorDeliveryFees was undefined, causing:
        //   TypeError: Cannot read properties of undefined (reading 'find')
        // This crashed the markDelivered transaction and the rider was never paid.
        vendorDeliveryFees: [
            {
                restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
                deliveryFee: { type: Number, default: 0 },
            },
        ],

        // ✅ FIX: Renamed from `status` to `orderStatus` — every service, controller,
        // and socket handler uses `orderStatus`. With `status` in the schema,
        // Mongoose silently dropped all writes to `order.orderStatus` (strict mode).
        // The order appeared to update (200 OK) but nothing persisted in MongoDB.
        orderStatus: {
            type: String,
            enum: [
                "pending",
                "accepted",
                "preparing",
                "ready_for_pickup",       // ✅ FIX: was "ready" — mismatched everywhere
                "rider_assigned",         // ✅ FIX: was missing
                "out_for_delivery",       // ✅ FIX: was "picked_up" — mismatched
                "delivered",
                "completed",
                "cancelled",
                "failed",                 // ✅ FIX: was missing — needed by verifyPayment
                "refunded",               // ✅ FIX: was missing
            ],
            default: "pending",
            index: true,
        },

        statusLog: [
            {
                status: { type: String, required: true },
                changedBy: {
                    type: String,
                    // ✅ FIX: Added "admin" — rider.service.js and controllers use "vendor"
                    // and "rider" already in the enum, but admin actions were missing.
                    enum: ["customer", "vendor", "rider", "admin", "system"],
                    required: true,
                },
                timestamp: { type: Date, default: Date.now },
            },
        ],

        // ✅ FIX: Added "pending" and "failed" to paymentStatus enum.
        // Without "pending", Order.create({ paymentStatus: "pending" }) in initializePayment
        // threw a Mongoose validation error before the order was ever saved.
        // Without "failed", verifyPayment crashed when marking a failed payment.
        paymentStatus: {
            type: String,
            enum: ["pending", "unpaid", "paid", "failed", "refunded"],
            default: "pending",
        },

        paymentMethod: {
            type: String,
            enum: ["cash", "card", "transfer", "wallet"],
            default: "card",
        },

        note: { type: String },

        // Phone stored at order level for quick access (rider needs it for customer contact)
        phone: { type: String },
    },
    {
        timestamps: true,
        // Keep strict mode ON (default) — this is correct behaviour.
        // The fix is adding the missing fields above, not disabling strict mode.
    }
);

// Indexes for common query patterns
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ paymentReference: 1 });
orderSchema.index({ orderId: 1 });
orderSchema.index({ riderId: 1 });
orderSchema.index({ orderStatus: 1 });

const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);

export default Order;