import {
    fetchPaystackDispute,
    fetchPaystackRefund,
    fetchPaystackTransfer,
    getPaystackBalanceLedger,
    getPaystackBalances,
    listPaystackDisputes,
    listPaystackRefunds,
    listPaystackSettlements,
    listPaystackSettlementTransactions,
    listPaystackTransfers,
} from "../../../services/paystackTransfer.service.js";
import { reconcileWithdrawal } from "../../../services/transferReconciliation.service.js";

const providerError = (res, error) => res.status(error.response?.status || 502).json({
    success: false,
    message: error.response?.data?.message || error.message || "Paystack request failed",
});

const listHandler = (fn) => async (req, res) => {
    try {
        const payload = await fn(req.query);
        return res.json({ success: true, data: payload.data || payload, meta: payload.meta || null });
    } catch (error) {
        return providerError(res, error);
    }
};

export const getPaystackOperationsOverview = async (_req, res) => {
    try {
        const balances = await getPaystackBalances();
        return res.json({ success: true, data: { balances } });
    } catch (error) {
        return providerError(res, error);
    }
};

export const getPaystackTransfers = listHandler(listPaystackTransfers);
export const getPaystackBalanceLedgerAdmin = listHandler(getPaystackBalanceLedger);
export const getPaystackSettlements = listHandler(listPaystackSettlements);
export const getPaystackDisputes = listHandler(listPaystackDisputes);
export const getPaystackRefunds = listHandler(listPaystackRefunds);

const detailHandler = (fn, key = "id") => async (req, res) => {
    try {
        return res.json({ success: true, data: await fn(req.params[key]) });
    } catch (error) {
        return providerError(res, error);
    }
};

export const getPaystackTransfer = detailHandler(fetchPaystackTransfer, "idOrCode");
export const getPaystackDispute = detailHandler(fetchPaystackDispute);
export const getPaystackRefund = detailHandler(fetchPaystackRefund);

export const getPaystackSettlementTransactions = async (req, res) => {
    try {
        const payload = await listPaystackSettlementTransactions(req.params.id, req.query);
        return res.json({ success: true, data: payload.data || [], meta: payload.meta || null });
    } catch (error) {
        return providerError(res, error);
    }
};

export const reconcileAdminWithdrawal = async (req, res) => {
    try {
        const result = await reconcileWithdrawal({ id: req.params.id, source: "admin_manual" });
        return res.json({ success: true, data: result });
    } catch (error) {
        return providerError(res, error);
    }
};
