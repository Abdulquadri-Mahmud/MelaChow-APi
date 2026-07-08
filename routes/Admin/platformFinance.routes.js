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

const router = express.Router();

router.get("/summary", financeAdminOnly, getRevenueSummary);
router.get("/chart", financeAdminOnly, getRevenueChart);
router.get("/transactions", financeAdminOnly, getTransactionLedger);
router.get("/vendor-breakdown", financeAdminOnly, getVendorBreakdown);
router.get("/escrow", financeAdminOnly, getUnreleasedEscrowList);
router.get("/refunds", financeAdminOnly, getRefundsList);
router.get("/payment-recovery", financeAdminOnly, getPaymentRecoveryList);
router.post("/payment-recovery/:reference/reconcile", financeAdminOnly, reconcilePaymentReference);

export default router;
