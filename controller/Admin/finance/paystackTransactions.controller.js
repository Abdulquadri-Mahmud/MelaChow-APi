import {
    exportPaystackTransactions,
    fetchPaystackTransaction,
    getPaystackTransactionTimeline,
    getPaystackTransactionTotals,
    listPaystackTransactions,
} from "../../../services/paystackTransactions.service.js";

const providerError = (res, error) => res.status(error.response?.status || 502).json({
    success: false,
    message: error.response?.data?.message || error.message || "Paystack transaction request failed",
});

export const getPaystackTransactionsAdmin = async (req, res) => {
    try {
        const payload = await listPaystackTransactions(req.query);
        return res.json({
            success: true,
            data: payload.data || [],
            meta: payload.meta || null,
        });
    } catch (error) {
        return providerError(res, error);
    }
};

export const getPaystackTransactionTotalsAdmin = async (req, res) => {
    try {
        const payload = await getPaystackTransactionTotals(req.query);
        return res.json({
            success: true,
            data: payload.data || payload,
        });
    } catch (error) {
        return providerError(res, error);
    }
};

export const exportPaystackTransactionsAdmin = async (req, res) => {
    try {
        const payload = await exportPaystackTransactions(req.query);
        return res.json({
            success: true,
            data: payload.data || payload,
        });
    } catch (error) {
        return providerError(res, error);
    }
};

export const getPaystackTransactionTimelineAdmin = async (req, res) => {
    try {
        const payload = await getPaystackTransactionTimeline(req.params.idOrRef);
        return res.json({
            success: true,
            data: payload.data || payload,
        });
    } catch (error) {
        return providerError(res, error);
    }
};

export const getPaystackTransactionAdmin = async (req, res) => {
    try {
        const payload = await fetchPaystackTransaction(req.params.id);
        return res.json({
            success: true,
            data: payload.data || payload,
        });
    } catch (error) {
        return providerError(res, error);
    }
};
