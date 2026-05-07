import mongoose from "mongoose";
import SupportTicket from "../model/supportTicket.model.js";
import Order from "../model/order/Order.js";
import { notifyAdmins } from "../services/notification.service.js";

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
      .populate("order", "orderId total paymentStatus orderStatus createdAt")
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
      .populate("order", "orderId total paymentStatus orderStatus createdAt")
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
        .populate("order", "orderId total paymentStatus orderStatus createdAt")
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
      .populate("order", "orderId total paymentStatus orderStatus deliveryAddress phone items createdAt")
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

    const updatedTicket = await SupportTicket.findById(ticket._id)
      .populate("userId", "firstname lastname fullName email phone")
      .populate("order", "orderId total paymentStatus orderStatus createdAt")
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
