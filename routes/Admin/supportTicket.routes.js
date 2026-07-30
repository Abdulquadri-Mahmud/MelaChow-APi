import express from "express";
import { adminAuth, financeAdminOnly } from "../../middleware/adminAuth.js";
import {
  getAdminSupportTicket,
  getAdminSupportTickets,
  updateAdminSupportTicket,
  replyToSupportTicket,
  assignSupportTicketToMe,
  approveSupportWalletRefund,
} from "../../controller/supportTicket.controller.js";

const router = express.Router();

router.get("/tickets", adminAuth, getAdminSupportTickets);
router.get("/tickets/:ticketId", adminAuth, getAdminSupportTicket);
router.patch("/tickets/:ticketId", adminAuth, updateAdminSupportTicket);
router.post("/tickets/:ticketId/reply", adminAuth, replyToSupportTicket);
router.post("/tickets/:ticketId/assign-to-me", adminAuth, assignSupportTicketToMe);
router.post("/tickets/:ticketId/wallet-refund", financeAdminOnly, approveSupportWalletRefund);

export default router;
