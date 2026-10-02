import express from "express";
import { adminAuth } from "../../middleware/adminAuth.js";
import * as controller from "../../controller/Admin/samkaLogisticsAdmin.controller.js";

const router = express.Router();
router.use(adminAuth);
router.get("/riders", controller.listRiders);
router.get("/riders/:riderId", controller.getRider);
router.get("/riders/:riderId/deliveries", controller.getRiderDeliveries);
router.get("/riders/:riderId/wallet", controller.getRiderWallet);
router.get("/riders/:riderId/ledger", controller.getRiderLedger);
router.get("/riders/:riderId/withdrawals", controller.getRiderWithdrawals);
router.post("/riders/:riderId/approve", controller.approveRider);
router.post("/riders/:riderId/reject", controller.rejectRider);
router.post("/riders/:riderId/suspend", controller.suspendRider);
router.get("/deliveries/:deliveryId", controller.getDelivery);
router.post("/deliveries/:deliveryId/cancel", controller.cancelDelivery);
router.post("/deliveries/:deliveryId/reassign", controller.reassignDelivery);
export default router;
