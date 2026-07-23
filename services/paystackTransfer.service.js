import axios from "axios";

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

const getAvailableNgnBalance = (payload) => {
    const data = payload?.data;

    if (Array.isArray(data)) {
        const ngnBalance = data.find((item) => item.currency === "NGN") || data[0];
        return Number(ngnBalance?.balance || 0);
    }

    return Number(data?.balance || 0);
};

/**
 * Check if the platform Paystack balance is sufficient for a transfer.
 * Returns { sufficient: boolean, available: number (kobo) }
 * Fails open on API error — logs but does not block payout attempt.
 */
export const checkPaystackBalance = async (requiredAmountKobo) => {
    requirePaystackSecret();

    try {
        const payload = await request({ method: "GET", url: "/balance" });
        const available = getAvailableNgnBalance(payload);
        return {
            sufficient: available >= requiredAmountKobo,
            available,
        };
    } catch (err) {
        console.error("❌ Paystack balance check failed:", err.response?.data || err.message);
        throw new Error("Paystack balance check failed");
    }
};

/**
 * Initiate a single Paystack transfer.
 * @param {object} params
 * @param {string} params.recipientCode - Paystack recipient_code
 * @param {number} params.amountKobo    - Amount in kobo (naira * 100)
 * @param {string} params.reference     - Unique idempotency reference
 * @param {string} params.reason        - Narration shown in bank alert
 * @returns {{ transferCode: string, status: string }}
 */
export const initiatePaystackTransfer = async ({
    recipientCode,
    amountKobo,
    reference,
    reason,
}) => {
    requirePaystackSecret();

    const payload = await request({
        method: "POST",
        url: "/transfer",
        data: {
            source: "balance",
            amount: amountKobo,
            recipient: recipientCode,
            reference,
            reason,
        },
    });

    const data = payload?.data;
    return {
        transferCode: data?.transfer_code || null,
        status: data?.status || "pending",
    };
};

/**
 * Create a Paystack transfer recipient.
 * @param {object} params
 * @param {string} params.name          - Account name
 * @param {string} params.accountNumber - Bank account number
 * @param {string} params.bankCode      - Three-digit bank code
 * @returns {string} recipient_code
 */
export const createTransferRecipient = async ({ name, accountNumber, bankCode }) => {
    requirePaystackSecret();

    const payload = await request({
        method: "POST",
        url: "/transferrecipient",
        data: {
            type: "nuban",
            name,
            account_number: accountNumber,
            bank_code: bankCode,
            currency: "NGN",
        },
    });

    const recipientCode = payload?.data?.recipient_code;
    if (!recipientCode) throw new Error("Paystack did not return a recipient code");
    return recipientCode;
};

export const verifyPaystackTransfer = async (reference) => {
    if (!reference) throw new Error("Transfer reference is required");
    const payload = await request({ method: "GET", url: `/transfer/verify/${encodeURIComponent(reference)}` });
    return payload?.data || null;
};

export const fetchPaystackTransfer = async (idOrCode) => {
    if (!idOrCode) throw new Error("Transfer id or code is required");
    const payload = await request({ method: "GET", url: `/transfer/${encodeURIComponent(idOrCode)}` });
    return payload?.data || null;
};

export const listPaystackTransfers = async (params = {}) => request({ method: "GET", url: "/transfer", params: cleanParams(params) });
export const getPaystackBalances = async () => (await request({ method: "GET", url: "/balance" }))?.data || [];
export const getPaystackBalanceLedger = async (params = {}) => request({ method: "GET", url: "/balance/ledger", params: cleanParams(params) });
export const listPaystackSettlements = async (params = {}) => request({ method: "GET", url: "/settlement", params: cleanParams(params) });
export const listPaystackSettlementTransactions = async (id, params = {}) => {
    if (!id) throw new Error("Settlement id is required");
    return request({ method: "GET", url: `/settlement/${encodeURIComponent(id)}/transactions`, params: cleanParams(params) });
};
export const listPaystackDisputes = async (params = {}) => request({ method: "GET", url: "/dispute", params: cleanParams(params) });
export const fetchPaystackDispute = async (id) => {
    if (!id) throw new Error("Dispute id is required");
    return (await request({ method: "GET", url: `/dispute/${encodeURIComponent(id)}` }))?.data || null;
};
export const listPaystackRefunds = async (params = {}) => request({ method: "GET", url: "/refund", params: cleanParams(params) });
export const fetchPaystackRefund = async (id) => {
    if (!id) throw new Error("Refund id is required");
    return (await request({ method: "GET", url: `/refund/${encodeURIComponent(id)}` }))?.data || null;
};
