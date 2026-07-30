import express from "express";
import auth from "../middleware/auth.middleware.js";
import multiAuth from "../middleware/multiAuth.middleware.js";
import {
  createSupportTicket,
  getMySupportTicket,
  getMySupportTickets,
  addCustomerSupportMessage,
} from "../controller/supportTicket.controller.js";
import { handleSupportChat } from "../controller/supportChat.controller.js";

const router = express.Router();

router.post("/tickets", auth, createSupportTicket);
router.get("/my-tickets", auth, getMySupportTickets);
router.get("/my-tickets/:ticketId", auth, getMySupportTicket);
router.post("/my-tickets/:ticketId/messages", auth, addCustomerSupportMessage);

// AI support chatbot — accepts both customer and vendor sessions via multiAuth
router.post("/chat", multiAuth, handleSupportChat);

export default router;
