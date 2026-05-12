import mongoose from "mongoose";

const invoiceLineSchema = new mongoose.Schema(
    {
        label: { type: String, required: true },
        quantity: { type: Number, default: 1 },
        unitAmount: { type: Number, default: 0 },
        amount: { type: Number, required: true },
    },
    { _id: false }
);

const invoiceSchema = new mongoose.Schema(
    {
        invoiceNumber: { type: String, required: true, unique: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        type: { type: String, enum: ["order", "wallet_funding"], required: true, index: true },
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null, index: true },
        paymentReference: { type: String, default: "", index: true },
        status: { type: String, enum: ["paid", "void"], default: "paid", index: true },
        currency: { type: String, default: "NGN" },
        subtotal: { type: Number, default: 0 },
        deliveryFee: { type: Number, default: 0 },
        serviceFee: { type: Number, default: 0 },
        total: { type: Number, required: true },
        paidAt: { type: Date, default: Date.now },
        customer: {
            name: { type: String, default: "" },
            email: { type: String, default: "" },
            phone: { type: String, default: "" },
        },
        lines: { type: [invoiceLineSchema], default: [] },
        metadata: { type: Object, default: {} },
    },
    { timestamps: true }
);

invoiceSchema.index(
    { type: 1, orderId: 1 },
    { unique: true, partialFilterExpression: { type: "order", orderId: { $type: "objectId" } } }
);
invoiceSchema.index(
    { type: 1, paymentReference: 1 },
    { unique: true, partialFilterExpression: { type: "wallet_funding", paymentReference: { $type: "string" } } }
);

export default mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);
