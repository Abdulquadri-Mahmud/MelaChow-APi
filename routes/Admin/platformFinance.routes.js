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

export default router;
