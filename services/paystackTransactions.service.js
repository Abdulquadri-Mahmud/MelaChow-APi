import axios from "axios";
import Order from "../model/order/Order.js";
import PaymentAttempt from "../model/order/PaymentAttempt.js";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

const requirePaystackSecret = () => {
    if (!PAYSTACK_SECRET_KEY) {
        throw new Error("PAYSTACK_SECRET_KEY is not configured");
    }
};

const request = async (config) => {
    requirePaystackSecret();
    const response = await axios.request({
        baseURL: PAYSTACK_BASE_URL,
        timeout: 15000,
        ...config,
        headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
            ...(config.headers || {}),
        },
    });
    return response.data;
};

const cleanParams = (params = {}) => Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
);

/**
 * Sanitizes authorization details to avoid exposing full signatures or sensitive data.
 */
const sanitizeAuthorization = (auth) => {
    if (!auth) return null;
    return {
        authorization_code: auth.authorization_code,
        bin: auth.bin,
        last4: auth.last4,
        exp_month: auth.exp_month,
        exp_year: auth.exp_year,
        channel: auth.channel,
        card_type: auth.card_type,
        bank: auth.bank,
        country_code: auth.country_code,
        brand: auth.brand,
        reusable: auth.reusable,
    };
};

/**
 * Sanitizes customer PII to avoid exposing unnecessary private data.
 */
const sanitizeCustomer = (cust) => {
    if (!cust) return null;
    return {
        id: cust.id,
        first_name: cust.first_name,
        last_name: cust.last_name,
        email: cust.email,
        customer_code: cust.customer_code,
        phone: cust.phone,
    };
};

/**
 * Derives localStatus and attaches local order preview to Paystack transaction.
 * Purely read-only evaluation — does NOT mutate database state.
 */
export const enrichTransactionWithLocalStatus = (tx, localOrder, localAttempt) => {
    const paystackStatus = String(tx?.status || "").toLowerCase();

    let localStatus = "NOT_FOUND_LOCAL";
    let mismatchReason = null;

    if (localOrder) {
        const isPaid = localOrder.paymentStatus === "paid" || localOrder.status === "paid";
        if (paystackStatus === "success") {
            if (isPaid) {
                localStatus = "MATCHED";
            } else {
                localStatus = "MISMATCH_UNPAID_LOCAL";
                mismatchReason = `Paystack transaction succeeded, but local order ${localOrder.orderId} status is '${localOrder.paymentStatus || localOrder.status}'`;
            }
        } else {
            localStatus = "MATCHED";
        }
    } else if (localAttempt) {
        if (paystackStatus === "success") {
            localStatus = "MISMATCH_UNPAID_LOCAL";
            mismatchReason = `Paystack transaction succeeded, but local payment attempt for reference '${tx.reference}' is '${localAttempt.status}'`;
        } else {
            localStatus = "MATCHED";
        }
    } else {
        if (paystackStatus === "success") {
            localStatus = "NOT_FOUND_LOCAL";
            mismatchReason = `Paystack transaction succeeded, but no local Order or PaymentAttempt record was found for reference '${tx.reference}'`;
        } else {
            localStatus = "NOT_FOUND_LOCAL";
        }
    }

    return {
        ...tx,
        authorization: sanitizeAuthorization(tx.authorization),
        customer: sanitizeCustomer(tx.customer),
        ip_address: undefined, // Redact IP address
        localStatus,
        mismatchReason,
        localOrder: localOrder ? {
            id: localOrder._id,
            orderId: localOrder.orderId,
            total: localOrder.total,
            status: localOrder.status,
            paymentStatus: localOrder.paymentStatus,
            createdAt: localOrder.createdAt,
        } : null,
        localAttempt: localAttempt ? {
            id: localAttempt._id,
            status: localAttempt.status,
            reason: localAttempt.reason,
            createdAt: localAttempt.createdAt,
        } : null,
    };
};

/**
 * Batch cross-references array of Paystack transactions with local DB records.
 */
export const enrichAndSanitizeTransactions = async (transactions = []) => {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return [];
    }

    const references = transactions.map((t) => t.reference).filter(Boolean);

    // Query local Mongo orders and payment attempts by reference
    const [localOrders, localAttempts] = await Promise.all([
        Order.find({ paymentReference: { $in: references } }).lean().exec(),
        PaymentAttempt.find({ paymentReference: { $in: references } }).lean().exec(),
    ]);

    const orderMap = new Map(localOrders.map((o) => [o.paymentReference, o]));
    const attemptMap = new Map(localAttempts.map((a) => [a.paymentReference, a]));

    return transactions.map((tx) => {
        const order = orderMap.get(tx.reference);
        const attempt = attemptMap.get(tx.reference);
        return enrichTransactionWithLocalStatus(tx, order, attempt);
    });
};

/**
 * List Paystack transactions with cross-referencing and sorting unreconciled gaps to top.
 */
export const listPaystackTransactions = async (queryParams = {}) => {
    const params = cleanParams({
        perPage: queryParams.perPage || 50,
        page: queryParams.page || 1,
        customer: queryParams.customer,
        status: queryParams.status,
        from: queryParams.from,
        to: queryParams.to,
        amount: queryParams.amount,
    });

    const payload = await request({
        method: "GET",
        url: "/transaction",
        params,
    });

    const rawTransactions = payload?.data || [];
    const enriched = await enrichAndSanitizeTransactions(rawTransactions);

    // Sort NOT_FOUND_LOCAL and MISMATCH_UNPAID_LOCAL to the top by default for admin attention
    enriched.sort((a, b) => {
        const priorityOrder = { NOT_FOUND_LOCAL: 0, MISMATCH_UNPAID_LOCAL: 1, MATCHED: 2 };
        const priorityA = priorityOrder[a.localStatus] ?? 2;
        const priorityB = priorityOrder[b.localStatus] ?? 2;
        return priorityA - priorityB;
    });

    return {
        ...payload,
        data: enriched,
    };
};

/**
 * Fetch a single Paystack transaction by numeric ID (handled as string).
 */
export const fetchPaystackTransaction = async (id) => {
    const stringId = String(id).trim();
    const payload = await request({
        method: "GET",
        url: `/transaction/${stringId}`,
    });

    const tx = payload?.data;
    if (!tx) return payload;

    const [enriched] = await enrichAndSanitizeTransactions([tx]);
    return { ...payload, data: enriched };
};

/**
 * Get aggregate transaction totals from Paystack.
 */
export const getPaystackTransactionTotals = async (queryParams = {}) => {
    const params = cleanParams({
        from: queryParams.from,
        to: queryParams.to,
        page: queryParams.page,
        perPage: queryParams.perPage,
    });

    return await request({
        method: "GET",
        url: "/transaction/totals",
        params,
    });
};

/**
 * Get signed CSV export download link from Paystack.
 */
export const exportPaystackTransactions = async (queryParams = {}) => {
    const params = cleanParams({
        from: queryParams.from,
        to: queryParams.to,
        status: queryParams.status,
        currency: queryParams.currency,
        amount: queryParams.amount,
        settled: queryParams.settled,
        settlement: queryParams.settlement,
        payment_page: queryParams.payment_page,
    });

    return await request({
        method: "GET",
        url: "/transaction/export",
        params,
    });
};

/**
 * Get transaction timeline / attempt history.
 */
export const getPaystackTransactionTimeline = async (idOrRef) => {
    const identifier = String(idOrRef).trim();
    return await request({
        method: "GET",
        url: `/transaction/timeline/${identifier}`,
    });
};
