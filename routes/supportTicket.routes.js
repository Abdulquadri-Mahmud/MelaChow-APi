import express from "express";
import auth from "../middleware/auth.middleware.js";
import {
  createSupportTicket,
  getMySupportTicket,
  getMySupportTickets,
} from "../controller/supportTicket.controller.js";

const router = express.Router();

router.post("/tickets", auth, createSupportTicket);
router.get("/my-tickets", auth, getMySupportTickets);
router.get("/my-tickets/:ticketId", auth, getMySupportTicket);

export default router;
