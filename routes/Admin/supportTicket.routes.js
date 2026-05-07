import express from "express";
import { adminAuth } from "../../middleware/adminAuth.js";
import {
  getAdminSupportTicket,
  getAdminSupportTickets,
  updateAdminSupportTicket,
} from "../../controller/supportTicket.controller.js";

const router = express.Router();

router.get("/tickets", adminAuth, getAdminSupportTickets);
router.get("/tickets/:ticketId", adminAuth, getAdminSupportTicket);
router.patch("/tickets/:ticketId", adminAuth, updateAdminSupportTicket);

export default router;
