import express from "express";
import {
    getRevenueSummary,
    getRevenueChart,
    getTransactionLedger,
    getVendorBreakdown,
    getUnreleasedEscrowList,
    getRefundsList
} from "../../controller/Admin/finance/platformFinance.controller.js";
import { adminAuth } from "../../middleware/adminAuth.js";

const router = express.Router();

router.get("/summary", adminAuth, getRevenueSummary);
router.get("/chart", adminAuth, getRevenueChart);
router.get("/transactions", adminAuth, getTransactionLedger);
router.get("/vendor-breakdown", adminAuth, getVendorBreakdown);
router.get("/escrow", adminAuth, getUnreleasedEscrowList);
router.get("/refunds", adminAuth, getRefundsList);

export default router;
