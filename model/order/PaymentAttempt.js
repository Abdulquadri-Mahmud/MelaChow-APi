import mongoose from "mongoose";

const paymentAttemptEventSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    message: { type: String, default: "" },
    metadata: { type: Object, default: {} },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const paymentAttemptSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    provider: {
      type: String,
      default: "paystack",
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      index: true,
      default: null,
    },
    orderCode: {
      type: String,
      index: true,
      default: "",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    status: {
      type: String,
      enum: [
        "initialized",
        "pending",
        "success",
        "failed",
        "amount_mismatch",
        "currency_mismatch",
        "provider_mismatch",
        "recovered",
        "review",
        "abandoned",
      ],
      default: "initialized",
      index: true,
    },
    expectedAmount: { type: Number, default: 0 },
    expectedAmountKobo: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    paidAmountKobo: { type: Number, default: 0 },
    currency: { type: String, default: "NGN" },
    providerStatus: { type: String, default: "" },
    gatewayResponse: { type: String, default: "" },
    authorizationUrl: { type: String, default: "" },
    accessCode: { type: String, default: "" },
    failureReason: { type: String, default: "" },
    recoveryState: { type: String, default: "awaiting_verification", index: true },
    orderSnapshot: { type: Object, default: {} },
    cartSnapshot: { type: Object, default: {} },
    providerPayload: { type: Object, default: {} },
    events: {
      type: [paymentAttemptEventSchema],
      default: [],
    },
  },
  { timestamps: true }
);

paymentAttemptSchema.index({ createdAt: -1 });
paymentAttemptSchema.index({ userId: 1, createdAt: -1 });

const PaymentAttempt =
  mongoose.models.PaymentAttempt || mongoose.model("PaymentAttempt", paymentAttemptSchema);

export default PaymentAttempt;
