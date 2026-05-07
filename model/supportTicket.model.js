import mongoose from "mongoose";

const supportTimelineSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    from: { type: String, default: "" },
    to: { type: String, default: "" },
    note: { type: String, default: "" },
    actorRole: {
      type: String,
      enum: ["customer", "admin", "system"],
      default: "system",
    },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const supportAdminNoteSchema = new mongoose.Schema(
  {
    note: { type: String, required: true, trim: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    adminName: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const supportTicketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    orderReference: { type: String, trim: true, default: "" },
    paymentReference: { type: String, trim: true, default: "" },
    category: {
      type: String,
      enum: [
        "payment_issue",
        "refund_request",
        "cancelled_order",
        "missing_or_wrong_item",
        "late_delivery",
        "vendor_issue",
        "rider_issue",
        "account_issue",
        "app_bug",
        "other",
      ],
      default: "other",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
      index: true,
    },
    status: {
      type: String,
      enum: ["open", "pending", "escalated", "resolved", "closed"],
      default: "open",
      index: true,
    },
    subject: { type: String, required: true, trim: true, maxlength: 140 },
    message: { type: String, required: true, trim: true, maxlength: 2500 },
    customerName: { type: String, trim: true, default: "" },
    customerEmail: { type: String, trim: true, lowercase: true, default: "" },
    customerPhone: { type: String, trim: true, default: "" },
    adminNotes: { type: [supportAdminNoteSchema], default: [] },
    timeline: { type: [supportTimelineSchema], default: [] },
    lastCustomerActivityAt: { type: Date, default: Date.now },
    lastAdminActivityAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

supportTicketSchema.pre("validate", function (next) {
  if (!this.ticketNumber) {
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    this.ticketNumber = `SUP-${Date.now().toString(36).toUpperCase()}-${random}`;
  }

  if (!this.timeline?.length) {
    this.timeline = [
      {
        action: "created",
        to: this.status || "open",
        note: "Customer opened a support ticket.",
        actorRole: "customer",
        actorId: this.userId,
      },
    ];
  }

  next();
});

supportTicketSchema.index({ createdAt: -1 });
supportTicketSchema.index({ status: 1, priority: 1, createdAt: -1 });
supportTicketSchema.index({ category: 1, createdAt: -1 });
supportTicketSchema.index({ ticketNumber: "text", subject: "text", message: "text", orderReference: "text", paymentReference: "text" });

const SupportTicket = mongoose.models.SupportTicket || mongoose.model("SupportTicket", supportTicketSchema);

export default SupportTicket;
