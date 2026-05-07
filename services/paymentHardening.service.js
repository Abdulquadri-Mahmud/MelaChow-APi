import axios from "axios";
import PaymentAttempt from "../model/order/PaymentAttempt.js";

const PAYSTACK_VERIFY_URL = "https://api.paystack.co/transaction/verify";

const toKobo = (amount) => Math.round(Number(amount || 0) * 100);

const orderSnapshot = (order) => ({
  orderId: order?.orderId || "",
  total: Number(order?.total || 0),
  subtotal: Number(order?.subtotal || 0),
  deliveryFee: Number(order?.deliveryFee || 0),
  serviceFee: Number(order?.serviceFee || 0),
  paymentStatus: order?.paymentStatus || "",
  orderStatus: order?.orderStatus || "",
});

const providerSnapshot = (payData) => ({
  reference: payData?.reference || "",
  status: payData?.status || "",
  amount: payData?.amount || 0,
  currency: payData?.currency || "",
  gateway_response: payData?.gateway_response || "",
  paid_at: payData?.paid_at || null,
});

export const verifyPaystackReference = async (reference) => {
  if (!reference) throw new Error("Payment reference is required");

  const verifyResp = await axios.get(`${PAYSTACK_VERIFY_URL}/${reference}`, {
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    },
  });

  return verifyResp.data?.data || null;
};

export const recordPaymentAttemptEvent = async ({
  reference,
  order = null,
  status,
  recoveryState,
  type,
  message,
  metadata = {},
  payData = null,
  cartSnapshot = null,
  authorizationUrl = "",
  accessCode = "",
  session = null,
}) => {
  if (!reference) return null;

  const expectedAmount = Number(order?.total || 0);
  const update = {
    $setOnInsert: {
      reference,
      provider: "paystack",
      createdAt: new Date(),
    },
    $set: {
      updatedAt: new Date(),
      ...(order
        ? {
            orderId: order._id || null,
            orderCode: order.orderId || "",
            userId: order.userId || null,
            expectedAmount,
            expectedAmountKobo: toKobo(expectedAmount),
            orderSnapshot: orderSnapshot(order),
          }
        : {}),
      ...(status ? { status } : {}),
      ...(recoveryState ? { recoveryState } : {}),
      ...(payData
        ? {
            paidAmount: Number(payData.amount || 0) / 100,
            paidAmountKobo: Number(payData.amount || 0),
            currency: payData.currency || "NGN",
            providerStatus: payData.status || "",
            gatewayResponse: payData.gateway_response || "",
            providerPayload: providerSnapshot(payData),
          }
        : {}),
      ...(cartSnapshot ? { cartSnapshot } : {}),
      ...(authorizationUrl ? { authorizationUrl } : {}),
      ...(accessCode ? { accessCode } : {}),
    },
    $push: {
      events: {
        type,
        message,
        metadata,
        at: new Date(),
      },
    },
  };

  return PaymentAttempt.findOneAndUpdate({ reference }, update, {
    upsert: true,
    new: true,
    session,
    setDefaultsOnInsert: true,
  });
};

export const validateSuccessfulPaymentForOrder = async (order, payData, { session = null } = {}) => {
  const reference = order?.paymentReference;

  if (!payData || payData.status !== "success") {
    await recordPaymentAttemptEvent({
      reference,
      order,
      payData,
      status: "failed",
      recoveryState: "failed",
      type: "payment_verify_failed",
      message: payData?.gateway_response || "Payment not successful on provider",
      session,
    });
    const error = new Error("Payment not successful");
    error.code = "PAYMENT_NOT_SUCCESSFUL";
    error.statusCode = 400;
    throw error;
  }

  if (payData.reference && reference && payData.reference !== reference) {
    await recordPaymentAttemptEvent({
      reference,
      order,
      payData,
      status: "provider_mismatch",
      recoveryState: "review",
      type: "payment_reference_mismatch",
      message: "Provider reference does not match local order reference",
      metadata: { localReference: reference, providerReference: payData.reference },
      session,
    });
    const error = new Error("Payment reference mismatch. Please contact support.");
    error.code = "PAYMENT_REFERENCE_MISMATCH";
    error.statusCode = 409;
    throw error;
  }

  const currency = String(payData.currency || "NGN").toUpperCase();
  if (currency !== "NGN") {
    await recordPaymentAttemptEvent({
      reference,
      order,
      payData,
      status: "currency_mismatch",
      recoveryState: "review",
      type: "payment_currency_mismatch",
      message: "Provider currency does not match platform currency",
      metadata: {
        expectedCurrency: "NGN",
        providerCurrency: currency,
      },
      session,
    });
    const error = new Error("Payment currency mismatch. Please contact support.");
    error.code = "PAYMENT_CURRENCY_MISMATCH";
    error.statusCode = 409;
    throw error;
  }

  const expectedKobo = toKobo(order.total);
  const paidKobo = Number(payData.amount || 0);

  if (paidKobo !== expectedKobo) {
    await recordPaymentAttemptEvent({
      reference,
      order,
      payData,
      status: "amount_mismatch",
      recoveryState: "review",
      type: "payment_amount_mismatch",
      message: "Provider amount does not match backend-calculated order total",
      metadata: {
        expectedKobo,
        paidKobo,
        expectedAmount: Number(order.total || 0),
        paidAmount: paidKobo / 100,
      },
      session,
    });
    const error = new Error(
      `Payment amount mismatch. Expected ₦${Number(order.total || 0).toLocaleString()}, received ₦${(paidKobo / 100).toLocaleString()}. Please contact support.`
    );
    error.code = "PAYMENT_AMOUNT_MISMATCH";
    error.statusCode = 409;
    throw error;
  }

  await recordPaymentAttemptEvent({
    reference,
    order,
    payData,
    status: "success",
    recoveryState: "verified",
    type: "payment_verified",
    message: "Provider payment verified against backend order total",
    metadata: { expectedKobo, paidKobo },
    session,
  });

  return {
    expectedKobo,
    paidKobo,
    paidAmount: paidKobo / 100,
  };
};
