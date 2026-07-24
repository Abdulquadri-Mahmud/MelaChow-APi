import express from "express";
import {
    getRevenueSummary,
    getRevenueChart,
    getTransactionLedger,
    getVendorBreakdown,
    getUnreleasedEscrowList,
    getRefundsList,
    getPaymentRecoveryList,
    reconcilePaymentReference
} from "../../controller/Admin/finance/platformFinance.controller.js";
import { financeAdminOnly } from "../../middleware/adminAuth.js";
import {
    getPaystackBalanceLedgerAdmin,
    getPaystackDispute,
    getPaystackDisputes,
    getPaystackOperationsOverview,
    getPaystackRefund,
    getPaystackRefunds,
    getPaystackSettlementTransactions,
    getPaystackSettlements,
    getPaystackTransfer,
    getPaystackTransfers,
    reconcileAdminWithdrawal,
} from "../../controller/Admin/finance/paystackOperations.controller.js";
import {
    exportPaystackTransactionsAdmin,
    getPaystackTransactionAdmin,
    getPaystackTransactionTimelineAdmin,
    getPaystackTransactionTotalsAdmin,
    getPaystackTransactionsAdmin,
} from "../../controller/Admin/finance/paystackTransactions.controller.js";

const router = express.Router();

router.get("/summary", financeAdminOnly, getRevenueSummary);
router.get("/chart", financeAdminOnly, getRevenueChart);
router.get("/transactions", financeAdminOnly, getTransactionLedger);
router.get("/vendor-breakdown", financeAdminOnly, getVendorBreakdown);
router.get("/escrow", financeAdminOnly, getUnreleasedEscrowList);
router.get("/refunds", financeAdminOnly, getRefundsList);
router.get("/payment-recovery", financeAdminOnly, getPaymentRecoveryList);
router.post("/payment-recovery/:reference/reconcile", financeAdminOnly, reconcilePaymentReference);
router.get("/paystack/overview", financeAdminOnly, getPaystackOperationsOverview);
router.get("/paystack/transfers", financeAdminOnly, getPaystackTransfers);
router.get("/paystack/transfers/:idOrCode", financeAdminOnly, getPaystackTransfer);
router.post("/paystack/withdrawals/:id/reconcile", financeAdminOnly, reconcileAdminWithdrawal);
router.get("/paystack/balance-ledger", financeAdminOnly, getPaystackBalanceLedgerAdmin);
router.get("/paystack/settlements", financeAdminOnly, getPaystackSettlements);
router.get("/paystack/settlements/:id/transactions", financeAdminOnly, getPaystackSettlementTransactions);
router.get("/paystack/disputes", financeAdminOnly, getPaystackDisputes);
router.get("/paystack/disputes/:id", financeAdminOnly, getPaystackDispute);
router.get("/paystack/refunds", financeAdminOnly, getPaystackRefunds);
router.get("/paystack/refunds/:id", financeAdminOnly, getPaystackRefund);

// Paystack Transactions Oversight Routes (financeAdminOnly)
// Specific sub-paths registered before generic :id route to avoid route matching conflicts
router.get("/paystack/transactions/totals", financeAdminOnly, getPaystackTransactionTotalsAdmin);
router.get("/paystack/transactions/export", financeAdminOnly, exportPaystackTransactionsAdmin);
router.get("/paystack/transactions/timeline/:idOrRef", financeAdminOnly, getPaystackTransactionTimelineAdmin);
router.get("/paystack/transactions/:id", financeAdminOnly, getPaystackTransactionAdmin);
router.get("/paystack/transactions", financeAdminOnly, getPaystackTransactionsAdmin);

export default router;
