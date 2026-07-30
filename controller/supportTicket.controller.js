import mongoose from "mongoose";
import SupportTicket from "../model/supportTicket.model.js";
import Order from "../model/order/Order.js";
import { notifyAdmins, sendNotification } from "../services/notification.service.js";
import { sendMail } from "../config/mailer.js";
import { settleSupportRefund } from "../services/supportRefundSettlement.service.js";

const CATEGORY_PRIORITY = {
  payment_issue: "high",
  refund_request: "high",
  cancelled_order: "high",
  missing_or_wrong_item: "normal",
  late_delivery: "normal",
  vendor_issue: "normal",
  rider_issue: "normal",
  account_issue: "normal",
  app_bug: "normal",
  other: "normal",
};

const SUPPORT_STATUSES = new Set(["open", "pending", "escalated", "resolved", "closed"]);
const SUPPORT_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const FIRST_RESPONSE_HOURS = { urgent: 1, high: 4, normal: 12, low: 24 };
const RESOLUTION_HOURS = { urgent: 8, high: 24, normal: 72, low: 120 };
function deadlineFromNow(hours) { return new Date(Date.now() + hours * 60 * 60 * 1000); }
function safeEvidence(value) { const urls = Array.isArray(value) ? value : []; return [...new Set(urls.map((url) => cleanText(url, 1000)).filter((url) => /^https:\/\//i.test(url)))].slice(0, 5); }
async function notifyCustomerSupport(ticket, title, message) {
  const url = "/get-help/tickets/" + ticket._id;
  await sendNotification(ticket.userId, "support_update", { title, message, url, additionalData: { ticketId: String(ticket._id), ticketNumber: ticket.ticketNumber } }).catch((error) => console.error("Support notification failed:", error.message));
  if (ticket.customerEmail) sendMail({ to: ticket.customerEmail, subject: title + " — " + ticket.ticketNumber, html: "<p>" + message + "</p><p>Open your MelaChow support ticket: <a href='" + (process.env.FRONTEND_URL || "https://melachow.com") + url + "'>" + ticket.ticketNumber + "</a></p>" }).catch((error) => console.error("Support email failed:", error.message));
}

function cleanText(value, maxLength = 2500) {
  return String(value || "").trim().slice(0, maxLength);
}

function getCustomerName(user) {
  return cleanText(user?.fullName || `${user?.firstname || ""} ${user?.lastname || ""}`.trim(), 120);
}

async function resolveCustomerOrder(orderReference, userId) {
  const reference = cleanText(orderReference, 80);
  if (!reference) return null;

  const query = mongoose.Types.ObjectId.isValid(reference)
    ? { $or: [{ _id: reference }, { orderId: reference }] }
    : { orderId: reference };

  return Order.findOne({ ...query, userId }).select("_id orderId paymentReference total paymentStatus orderStatus").lean();
}

export const createSupportTicket = async (req, res) => {
  try {
    const {
      category = "other",
      subject,
      message,
      orderReference,
      paymentReference,
      customerPhone,
      customerEmail,
      requestedResolution,
      evidence,
    } = req.body || {};

    const normalizedSubject = cleanText(subject, 140);
    const normalizedMessage = cleanText(message, 2500);

    if (normalizedSubject.length < 5) {
      return res.status(400).json({ success: false, message: "Please enter a clear complaint subject." });
    }

    if (normalizedMessage.length < 15) {
      return res.status(400).json({ success: false, message: "Please describe the issue in a little more detail." });
    }

    const userId = req.user?._id || req.userId;
    const matchedOrder = await resolveCustomerOrder(orderReference, userId);
    const safeCategory = CATEGORY_PRIORITY[category] ? category : "other";

    const ticket = await SupportTicket.create({
      userId,
      order: matchedOrder?._id || null,
      orderReference: cleanText(orderReference || matchedOrder?.orderId || "", 80),
      paymentReference: cleanText(paymentReference || matchedOrder?.paymentReference || "", 120),
      category: safeCategory,
      priority: CATEGORY_PRIORITY[safeCategory] || "normal",
      subject: normalizedSubject,
      message: normalizedMessage,
      customerName: getCustomerName(req.user),
      customerEmail: cleanText(customerEmail || req.user?.email || "", 160),
      customerPhone: cleanText(customerPhone || req.user?.phone || "", 40),
      requestedResolution: cleanText(requestedResolution, 240),
      evidence: safeEvidence(evidence),
      conversation: [{ body: normalizedMessage, senderRole: "customer", senderId: userId, senderName: getCustomerName(req.user), attachments: safeEvidence(evidence) }],
      firstResponseDueAt: deadlineFromNow(FIRST_RESPONSE_HOURS[CATEGORY_PRIORITY[safeCategory] || "normal"]),
      resolutionDueAt: deadlineFromNow(RESOLUTION_HOURS[CATEGORY_PRIORITY[safeCategory] || "normal"]),
    });

    await notifyAdmins("support_ticket", {
      message: `${ticket.ticketNumber}: ${ticket.subject}`,
      url: "/admin/support",
      additionalData: {
        ticketId: String(ticket._id),
        ticketNumber: ticket.ticketNumber,
        category: ticket.category,
        priority: ticket.priority,
      },
    }).catch((error) => {
      console.error("Failed to notify admins about support ticket:", error.message);
    });

    res.status(201).json({
      success: true,
      message: "Complaint submitted successfully. Our support team will review it.",
      data: { ticket },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMySupportTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.userId })
      .populate("order", "orderId total paymentStatus orderStatus riderId createdAt")
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    res.status(200).json({ success: true, data: { tickets } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getMySupportTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.ticketId, userId: req.userId })
      .populate("order", "orderId total paymentStatus orderStatus riderId createdAt")
      .lean();

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Support ticket not found." });
    }

    res.status(200).json({ success: true, data: { ticket } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdminSupportTickets = async (req, res) => {
  try {
    await SupportTicket.updateMany({ status: { $in: ["open", "pending"] }, resolutionDueAt: { $lt: new Date() } }, { $set: { status: "escalated" } });
    const {
      status,
      category,
      priority,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const filters = {};
    if (status && status !== "all") filters.status = status;
    if (category && category !== "all") filters.category = category;
    if (priority && priority !== "all") filters.priority = priority;

    if (search) {
      const regex = new RegExp(cleanText(search, 80), "i");
      filters.$or = [
        { ticketNumber: regex },
        { subject: regex },
        { message: regex },
        { customerName: regex },
        { customerEmail: regex },
        { customerPhone: regex },
        { orderReference: regex },
        { paymentReference: regex },
      ];
    }

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [tickets, total, statusCounts, categoryCounts] = await Promise.all([
      SupportTicket.find(filters)
        .populate("userId", "firstname lastname fullName email phone")
        .populate("order", "orderId total paymentStatus orderStatus riderId createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      SupportTicket.countDocuments(filters),
      SupportTicket.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      SupportTicket.aggregate([{ $group: { _id: "$category", count: { $sum: 1 } } }]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        tickets,
        stats: {
          total: await SupportTicket.countDocuments(),
          open: statusCounts.find((item) => item._id === "open")?.count || 0,
          pending: statusCounts.find((item) => item._id === "pending")?.count || 0,
          escalated: statusCounts.find((item) => item._id === "escalated")?.count || 0,
          resolved: statusCounts.find((item) => item._id === "resolved")?.count || 0,
          byCategory: categoryCounts.reduce((acc, item) => ({ ...acc, [item._id || "other"]: item.count }), {}),
        },
        pagination: {
          total,
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil(total / safeLimit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAdminSupportTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.ticketId)
      .populate("userId", "firstname lastname fullName email phone")
      .populate("order", "orderId total paymentStatus orderStatus riderId deliveryAddress phone items createdAt")
      .populate("adminNotes.adminId", "name email")
      .lean();

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Support ticket not found." });
    }

    res.status(200).json({ success: true, data: { ticket } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAdminSupportTicket = async (req, res) => {
  try {
    const { status, priority, note } = req.body || {};
    const ticket = await SupportTicket.findById(req.params.ticketId);

    if (!ticket) {
      return res.status(404).json({ success: false, message: "Support ticket not found." });
    }

    const previousStatus = ticket.status;
    const previousPriority = ticket.priority;
    const timeline = [];

    if (status && !SUPPORT_STATUSES.has(status)) {
      return res.status(400).json({ success: false, message: "Invalid support ticket status." });
    }

    if (priority && !SUPPORT_PRIORITIES.has(priority)) {
      return res.status(400).json({ success: false, message: "Invalid support ticket priority." });
    }

    if (status && status !== ticket.status) {
      ticket.status = status;
      timeline.push({
        action: "status_changed",
        from: previousStatus,
        to: status,
        actorRole: "admin",
        actorId: req.admin?._id,
      });
      if (status === "resolved") ticket.resolvedAt = new Date();
      if (status === "closed") ticket.closedAt = new Date();
    }

    if (priority && priority !== ticket.priority) {
      ticket.priority = priority;
      timeline.push({
        action: "priority_changed",
        from: previousPriority,
        to: priority,
        actorRole: "admin",
        actorId: req.admin?._id,
      });
    }

    const cleanNote = cleanText(note, 1200);
    if (cleanNote) {
      ticket.adminNotes.push({
        note: cleanNote,
        adminId: req.admin?._id,
        adminName: req.admin?.name || req.admin?.email || "Admin",
      });
      timeline.push({
        action: "admin_note_added",
        note: cleanNote,
        actorRole: "admin",
        actorId: req.admin?._id,
      });
    }

    if (timeline.length) {
      ticket.timeline.push(...timeline);
      ticket.lastAdminActivityAt = new Date();
    }

    await ticket.save();
    if (previousStatus !== ticket.status) await notifyCustomerSupport(ticket, "Your support ticket status changed", "Your ticket " + ticket.ticketNumber + " is now " + ticket.status + ". Open the ticket to view the latest details.");

    const updatedTicket = await SupportTicket.findById(ticket._id)
      .populate("userId", "firstname lastname fullName email phone")
      .populate("order", "orderId total paymentStatus orderStatus riderId createdAt")
      .lean();

    res.status(200).json({
      success: true,
      message: "Support ticket updated.",
      data: { ticket: updatedTicket },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const addCustomerSupportMessage = async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.ticketId, userId: req.userId });
    const body = cleanText(req.body?.message, 2500);
    if (!ticket) return res.status(404).json({ success: false, message: "Support ticket not found." });
    if (body.length < 2) return res.status(400).json({ success: false, message: "Please enter a message." });
    if (ticket.status === "closed" || ticket.status === "resolved") { ticket.status = "open"; ticket.reopenedAt = new Date(); }
    ticket.conversation.push({ body, senderRole: "customer", senderId: req.userId, senderName: ticket.customerName, attachments: safeEvidence(req.body?.evidence) });
    ticket.lastCustomerActivityAt = new Date();
    await ticket.save();
    await notifyAdmins("support_ticket", { message: ticket.ticketNumber + ": customer replied", url: "/admin/support", additionalData: { ticketId: String(ticket._id) } });
    return res.json({ success: true, data: { ticket } });
  } catch (error) { return res.status(500).json({ success: false, message: "Unable to send support message." }); }
};

export const replyToSupportTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.ticketId);
    const body = cleanText(req.body?.message, 2500);
    if (!ticket) return res.status(404).json({ success: false, message: "Support ticket not found." });
    if (body.length < 2) return res.status(400).json({ success: false, message: "Please enter a reply." });
    const adminName = req.admin?.name || req.admin?.email || "MelaChow Support";
    ticket.conversation.push({ body, senderRole: "admin", senderId: req.admin?._id, senderName: adminName });
    ticket.assignedAdminId = ticket.assignedAdminId || req.admin?._id; ticket.assignedAdminName = ticket.assignedAdminName || adminName; ticket.firstRespondedAt = ticket.firstRespondedAt || new Date(); ticket.lastAdminActivityAt = new Date();
    if (ticket.status === "open") ticket.status = "pending";
    await ticket.save();
    await notifyCustomerSupport(ticket, "MelaChow Support replied", adminName + ": " + body);
    return res.json({ success: true, data: { ticket } });
  } catch (error) { return res.status(500).json({ success: false, message: "Unable to send support reply." }); }
};

export const assignSupportTicketToMe = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.ticketId);
    if (!ticket) return res.status(404).json({ success: false, message: "Support ticket not found." });
    ticket.assignedAdminId = req.admin?._id; ticket.assignedAdminName = req.admin?.name || req.admin?.email || "Support"; ticket.lastAdminActivityAt = new Date();
    await ticket.save();
    return res.json({ success: true, data: { ticket } });
  } catch (error) { return res.status(500).json({ success: false, message: "Unable to assign support ticket." }); }
};
export const approveSupportWalletRefund = async (req, res) => {
  try {
    const { amount, liabilities, reason, evidenceSummary = "" } = req.body || {};
    if (!Array.isArray(liabilities) || !liabilities.length) return res.status(400).json({ success: false, message: "Select at least one liable party and amount." });
    const settlement = await settleSupportRefund({ ticketId: req.params.ticketId, refundAmount: amount, liabilities, reason: cleanText(reason, 1000), evidenceSummary: cleanText(evidenceSummary, 2000), admin: req.admin });
    const ticket = await SupportTicket.findById(req.params.ticketId);
    await notifyCustomerSupport(ticket, "Your MelaChow wallet refund is complete", "₦" + settlement.refundAmount + " has been credited to your MelaChow wallet for ticket " + ticket.ticketNumber + ".");
    return res.status(201).json({ success: true, data: { settlement } });
  } catch (error) { return res.status(400).json({ success: false, message: error.message || "Unable to approve wallet refund." }); }
};