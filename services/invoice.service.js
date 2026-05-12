import Invoice from "../model/invoice.model.js";
import Order from "../model/order/Order.js";
import User from "../model/user.model.js";

const nextInvoiceNumber = (type) => {
    const prefix = type === "wallet_funding" ? "MWF" : "MCO";
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
};

const customerFrom = (user, fallback = {}) => ({
    name: user?.fullName || `${user?.firstname || ""} ${user?.lastname || ""}`.trim() || fallback.name || "Customer",
    email: user?.email || fallback.email || "",
    phone: user?.phone || fallback.phone || "",
});

export const generateOrderInvoice = async (orderOrId, { session } = {}) => {
    const order = typeof orderOrId === "object" && orderOrId?._id
        ? orderOrId
        : await Order.findById(orderOrId).session(session || null);

    if (!order || order.paymentStatus !== "paid") return null;

    const existing = await Invoice.findOne({ type: "order", orderId: order._id }).session(session || null);
    if (existing) return existing;

    const user = await User.findById(order.userId).session(session || null).lean();
    const lines = (order.items || []).map((item) => {
        const quantity = Number(item.quantity || 1);
        const unitAmount = Number(item.price || item.unitPrice || 0);
        return {
            label: item.name || item.foodName || "Order item",
            quantity,
            unitAmount,
            amount: Number((unitAmount * quantity).toFixed(2)),
        };
    });

    if (Number(order.deliveryFee || 0) > 0) {
        lines.push({ label: "Delivery fee", quantity: 1, unitAmount: order.deliveryFee, amount: order.deliveryFee });
    }
    if (Number(order.serviceFee || 0) > 0) {
        lines.push({ label: "Service fee", quantity: 1, unitAmount: order.serviceFee, amount: order.serviceFee });
    }

    const [invoice] = await Invoice.create([{
        invoiceNumber: nextInvoiceNumber("order"),
        userId: order.userId,
        type: "order",
        orderId: order._id,
        paymentReference: order.paymentReference || "",
        subtotal: Number(order.subtotal || 0),
        deliveryFee: Number(order.deliveryFee || 0),
        serviceFee: Number(order.serviceFee || 0),
        total: Number(order.total || 0),
        paidAt: new Date(),
        customer: customerFrom(user, order.deliveryAddress),
        lines,
        metadata: { orderCode: order.orderId },
    }], { session });

    return invoice;
};

export const generateWalletFundingInvoice = async ({ userId, amount, reference, paidAt = new Date(), session } = {}) => {
    if (!userId || !reference || !amount) return null;

    const existing = await Invoice.findOne({ type: "wallet_funding", paymentReference: reference }).session(session || null);
    if (existing) return existing;

    const user = await User.findById(userId).session(session || null).lean();
    const [invoice] = await Invoice.create([{
        invoiceNumber: nextInvoiceNumber("wallet_funding"),
        userId,
        type: "wallet_funding",
        paymentReference: reference,
        subtotal: Number(amount),
        total: Number(amount),
        paidAt,
        customer: customerFrom(user),
        lines: [{
            label: "Wallet funding",
            quantity: 1,
            unitAmount: Number(amount),
            amount: Number(amount),
        }],
        metadata: { reference },
    }], { session });

    return invoice;
};

export const getUserInvoices = async (userId, { page = 1, limit = 20, type } = {}) => {
    const query = { userId };
    if (type && ["order", "wallet_funding"].includes(type)) query.type = type;
    const skip = (Number(page) - 1) * Number(limit);
    const [invoices, total] = await Promise.all([
        Invoice.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
        Invoice.countDocuments(query),
    ]);
    return { invoices, pagination: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) } };
};

export const getUserInvoiceById = async (userId, invoiceId) => {
    return Invoice.findOne({ _id: invoiceId, userId }).lean();
};
