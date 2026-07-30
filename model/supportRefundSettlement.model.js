import mongoose from "mongoose";

const liabilitySchema = new mongoose.Schema({
  party: { type: String, enum: ["vendor", "rider", "platform"], required: true },
  partyId: { type: mongoose.Schema.Types.ObjectId, default: null },
  amount: { type: Number, required: true, min: 0 },
  recoverySource: { type: String, enum: ["escrow", "wallet", "future_earnings", "platform"], required: true },
  recoveredAmount: { type: Number, default: 0, min: 0 },
  outstandingAmount: { type: Number, default: 0, min: 0 },
}, { _id: false });

const supportRefundSettlementSchema = new mongoose.Schema({
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: "SupportTicket", required: true, unique: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  refundAmount: { type: Number, required: true, min: 1 },
  destination: { type: String, enum: ["customer_wallet"], default: "customer_wallet", immutable: true },
  decision: { type: String, enum: ["vendor", "rider", "platform", "shared"], required: true },
  liabilities: { type: [liabilitySchema], required: true },
  reason: { type: String, required: true, trim: true, maxlength: 1000 },
  evidenceSummary: { type: String, trim: true, maxlength: 2000, default: "" },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
  approvedByName: { type: String, default: "" },
  status: { type: String, enum: ["completed", "recovery_outstanding"], default: "completed", index: true },
}, { timestamps: true });

supportRefundSettlementSchema.index({ orderId: 1, createdAt: -1 });

export default mongoose.models.SupportRefundSettlement || mongoose.model("SupportRefundSettlement", supportRefundSettlementSchema);
