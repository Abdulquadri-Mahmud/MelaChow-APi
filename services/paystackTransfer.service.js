import axios from "axios";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

const requirePaystackSecret = () => {
    if (!PAYSTACK_SECRET_KEY) {
        throw new Error("PAYSTACK_SECRET_KEY is not configured");
    }
};

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
        const response = await axios.get(`${PAYSTACK_BASE_URL}/balance`, {
            headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
        });
        const available = getAvailableNgnBalance(response.data);
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

    const response = await axios.post(
        `${PAYSTACK_BASE_URL}/transfer`,
        {
            source: "balance",
            amount: amountKobo,
            recipient: recipientCode,
            reference,
            reason,
        },
        {
            headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
        }
    );

    const data = response.data?.data;
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

    const response = await axios.post(
        `${PAYSTACK_BASE_URL}/transferrecipient`,
        {
            type: "nuban",
            name,
            account_number: accountNumber,
            bank_code: bankCode,
            currency: "NGN",
        },
        {
            headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
        }
    );

    const recipientCode = response.data?.data?.recipient_code;
    if (!recipientCode) throw new Error("Paystack did not return a recipient code");
    return recipientCode;
};
