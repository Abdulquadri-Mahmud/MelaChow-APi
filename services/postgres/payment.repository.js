import prisma from "../../config/prisma.js";

const toBigIntKobo = (amount) => BigInt(Math.round(Number(amount || 0)));

const nextInvoiceNumber = (type) => {
  const prefix = type === "wallet_funding" ? "MWF" : "MCO";
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
};

const orderSnapshot = (order) => ({
  orderId: order?.orderCode || order?.orderId || "",
  total: Number(order?.total || 0),
  subtotal: Number(order?.subtotal || 0),
  deliveryFee: Number(order?.deliveryFee || 0),
  serviceFee: Number(order?.serviceFee || 0),
  paymentStatus: order?.paymentStatus || "",
  orderStatus: order?.orderStatus || "",
  moneyUnit: "kobo",
});

const providerSnapshot = (payData) => ({
  reference: payData?.reference || "",
  status: payData?.status || "",
  amount: payData?.amount || 0,
  currency: payData?.currency || "",
  gateway_response: payData?.gateway_response || "",
  paid_at: payData?.paid_at || null,
});

const appendEvent = (events, { type, message, metadata }) => [
  ...(Array.isArray(events) ? events : []),
  {
    type: type || "payment_event",
    message: message || "",
    metadata: metadata || {},
    at: new Date().toISOString(),
  },
];

const paymentAttemptInclude = {
  order: {
    select: {
      id: true,
      legacyMongoId: true,
      orderCode: true,
      total: true,
      subtotal: true,
      deliveryFee: true,
      serviceFee: true,
      paymentStatus: true,
      orderStatus: true,
    },
  },
  user: { select: { legacyMongoId: true } },
};

const paidFulfillmentInclude = {
  user: {
    select: {
      legacyMongoId: true,
      firstname: true,
      lastname: true,
      fullName: true,
      email: true,
      phone: true,
    },
  },
  items: true,
  vendorOrders: {
    include: {
      restaurant: { select: { legacyMongoId: true, storeName: true } },
    },
  },
  vendorDeliveryFees: {
    include: {
      restaurant: { select: { legacyMongoId: true, storeName: true } },
    },
  },
};

const customerFromPostgres = (user, fallback = {}) => ({
  name: user?.fullName || `${user?.firstname || ""} ${user?.lastname || ""}`.trim() || fallback.name || "Customer",
  email: user?.email || fallback.email || "",
  phone: user?.phone || fallback.phone || "",
});

const orderInvoiceLines = (order) => {
  const lines = (order.items || []).map((item) => {
    const quantity = Number(item.quantity || 1);
    const unitAmount = Number(item.price || 0);
    return {
      label: item.name || item.portionLabel || "Order item",
      quantity,
      unitAmount,
      amount: unitAmount * quantity,
    };
  });

  if (Number(order.deliveryFee || 0) > 0) {
    lines.push({ label: "Delivery fee", quantity: 1, unitAmount: order.deliveryFee, amount: order.deliveryFee });
  }
  if (Number(order.serviceFee || 0) > 0) {
    lines.push({ label: "Service fee", quantity: 1, unitAmount: order.serviceFee, amount: order.serviceFee });
  }

  return lines;
};

const paymentAttemptShape = (attempt) => {
  if (!attempt) return null;

  return {
    _id: attempt.legacyMongoId || attempt.id,
    id: attempt.id,
    reference: attempt.reference,
    provider: attempt.provider,
    orderId: attempt.order?.legacyMongoId || attempt.orderId,
    orderCode: attempt.orderCode,
    userId: attempt.user?.legacyMongoId || attempt.userId,
    status: attempt.status,
    expectedAmount: Number(attempt.expectedAmount || 0),
    expectedAmountKobo: Number(attempt.expectedAmountKobo || 0),
    paidAmount: Number(attempt.paidAmount || 0),
    paidAmountKobo: Number(attempt.paidAmountKobo || 0),
    currency: attempt.currency,
    providerStatus: attempt.providerStatus,
    gatewayResponse: attempt.gatewayResponse,
    authorizationUrl: attempt.authorizationUrl,
    accessCode: attempt.accessCode,
    failureReason: attempt.failureReason,
    recoveryState: attempt.recoveryState,
    orderSnapshot: attempt.orderSnapshot || {},
    cartSnapshot: attempt.cartSnapshot || {},
    providerPayload: attempt.providerPayload || {},
    events: attempt.events || [],
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
  };
};

const postgresOrderShape = (order) => ({
  _id: order?.legacyMongoId || order?.id,
  id: order?.id,
  orderId: order?.orderCode,
  orderCode: order?.orderCode,
  userId: order?.user?.legacyMongoId || order?.userId,
  paymentReference: order?.paymentReference,
  paymentStatus: order?.paymentStatus,
  orderStatus: order?.orderStatus,
  total: order?.total,
  subtotal: order?.subtotal,
  deliveryFee: order?.deliveryFee,
  serviceFee: order?.serviceFee,
  deliveryAddress: order?.deliveryAddress,
  phone: order?.phone,
  createdAt: order?.createdAt,
  updatedAt: order?.updatedAt,
});

export const postgresPaymentRepository = {
  async findOrderByPaymentReference(reference) {
    if (!reference) return null;

    const order = await prisma.order.findUnique({
      where: { paymentReference: reference },
      include: {
        user: { select: { legacyMongoId: true } },
      },
    });

    return order;
  },

  shapeOrder(order) {
    return postgresOrderShape(order);
  },

  async initializeOrderPaymentReference({
    orderId,
    reference,
    cartSnapshot = null,
  }) {
    if (!orderId) throw new Error("Order ID is required");
    if (!reference) throw new Error("Payment reference is required");

    return prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id: orderId },
        data: { paymentReference: reference },
        select: {
          id: true,
          userId: true,
          orderCode: true,
          total: true,
          subtotal: true,
          deliveryFee: true,
          serviceFee: true,
          paymentStatus: true,
          orderStatus: true,
        },
      });

      const existingAttempt = await tx.paymentAttempt.findUnique({
        where: { reference },
        select: { events: true },
      });

      const attempt = await tx.paymentAttempt.upsert({
        where: { reference },
        create: {
          reference,
          provider: "paystack",
          orderId: order.id,
          orderCode: order.orderCode,
          userId: order.userId,
          status: "initialized",
          recoveryState: "awaiting_verification",
          expectedAmount: toBigIntKobo(order.total),
          expectedAmountKobo: toBigIntKobo(order.total),
          orderSnapshot: orderSnapshot(order),
          cartSnapshot: cartSnapshot || {},
          events: appendEvent([], {
            type: "payment_initialized",
            message: "Payment reference created before Paystack redirect",
            metadata: { moneyUnit: "kobo" },
          }),
        },
        update: {
          orderId: order.id,
          orderCode: order.orderCode,
          userId: order.userId,
          status: "initialized",
          recoveryState: "awaiting_verification",
          expectedAmount: toBigIntKobo(order.total),
          expectedAmountKobo: toBigIntKobo(order.total),
          orderSnapshot: orderSnapshot(order),
          cartSnapshot: cartSnapshot || {},
          events: appendEvent(existingAttempt?.events, {
            type: "payment_initialized",
            message: "Payment reference created before Paystack redirect",
            metadata: { moneyUnit: "kobo" },
          }),
        },
        include: paymentAttemptInclude,
      });

      return {
        order: { ...order, paymentReference: reference },
        attempt: paymentAttemptShape(attempt),
      };
    });
  },

  async recordProviderInitialized({
    reference,
    authorizationUrl = "",
    accessCode = "",
    providerPayload = null,
  }) {
    const existingAttempt = await prisma.paymentAttempt.findUnique({
      where: { reference },
      select: { events: true },
    });

    const attempt = await prisma.paymentAttempt.update({
      where: { reference },
      data: {
        status: "pending",
        recoveryState: "awaiting_verification",
        authorizationUrl,
        accessCode,
        providerPayload: providerPayload || {},
        events: appendEvent(existingAttempt?.events, {
          type: "payment_provider_initialized",
          message: "Paystack authorization URL generated",
          metadata: {
            authorizationUrl,
            accessCode,
          },
        }),
      },
      include: paymentAttemptInclude,
    });

    return paymentAttemptShape(attempt);
  },

  async recordInitializationFailed({
    reference,
    message,
    metadata = {},
  }) {
    if (!reference) return null;

    const existingAttempt = await prisma.paymentAttempt.findUnique({
      where: { reference },
      select: { events: true },
    });

    const attempt = await prisma.paymentAttempt.update({
      where: { reference },
      data: {
        status: "failed",
        recoveryState: "review",
        failureReason: message || "Payment initialization failed",
        events: appendEvent(existingAttempt?.events, {
          type: "payment_initialization_failed",
          message: message || "Payment initialization failed",
          metadata,
        }),
      },
      include: paymentAttemptInclude,
    });

    return paymentAttemptShape(attempt);
  },

  async recordPaymentAttemptEvent({
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
  }) {
    if (!reference) return null;

    const existingAttempt = await prisma.paymentAttempt.findUnique({
      where: { reference },
      select: { events: true },
    });

    const expectedKobo = toBigIntKobo(order?.total || 0);
    const paidKobo = toBigIntKobo(payData?.amount || 0);

    const attempt = await prisma.paymentAttempt.upsert({
      where: { reference },
      create: {
        reference,
        provider: "paystack",
        orderId: order?.id || null,
        orderCode: order?.orderCode || order?.orderId || "",
        userId: order?.userId || null,
        status: status || "initialized",
        recoveryState: recoveryState || "awaiting_verification",
        expectedAmount: expectedKobo,
        expectedAmountKobo: expectedKobo,
        paidAmount: paidKobo,
        paidAmountKobo: paidKobo,
        currency: payData?.currency || "NGN",
        providerStatus: payData?.status || "",
        gatewayResponse: payData?.gateway_response || "",
        authorizationUrl,
        accessCode,
        orderSnapshot: order ? orderSnapshot(order) : {},
        cartSnapshot: cartSnapshot || {},
        providerPayload: payData ? providerSnapshot(payData) : {},
        events: appendEvent([], { type, message, metadata }),
      },
      update: {
        ...(order
          ? {
              orderId: order.id,
              orderCode: order.orderCode || order.orderId || "",
              userId: order.userId || null,
              expectedAmount: expectedKobo,
              expectedAmountKobo: expectedKobo,
              orderSnapshot: orderSnapshot(order),
            }
          : {}),
        ...(status ? { status } : {}),
        ...(recoveryState ? { recoveryState } : {}),
        ...(payData
          ? {
              paidAmount: paidKobo,
              paidAmountKobo: paidKobo,
              currency: payData.currency || "NGN",
              providerStatus: payData.status || "",
              gatewayResponse: payData.gateway_response || "",
              providerPayload: providerSnapshot(payData),
            }
          : {}),
        ...(cartSnapshot ? { cartSnapshot } : {}),
        ...(authorizationUrl ? { authorizationUrl } : {}),
        ...(accessCode ? { accessCode } : {}),
        events: appendEvent(existingAttempt?.events, { type, message, metadata }),
      },
      include: paymentAttemptInclude,
    });

    return paymentAttemptShape(attempt);
  },

  async validateSuccessfulPaymentForOrder(order, payData) {
    const reference = order?.paymentReference;
    if (!reference) throw new Error("Payment reference is required");

    if (!payData || payData.status !== "success") {
      await this.recordPaymentAttemptEvent({
        reference,
        order,
        payData,
        status: "failed",
        recoveryState: "failed",
        type: "payment_verify_failed",
        message: payData?.gateway_response || "Payment not successful on provider",
      });
      const error = new Error("Payment not successful");
      error.code = "PAYMENT_NOT_SUCCESSFUL";
      error.statusCode = 400;
      throw error;
    }

    if (payData.reference && reference && payData.reference !== reference) {
      await this.recordPaymentAttemptEvent({
        reference,
        order,
        payData,
        status: "provider_mismatch",
        recoveryState: "review",
        type: "payment_reference_mismatch",
        message: "Provider reference does not match local order reference",
        metadata: { localReference: reference, providerReference: payData.reference },
      });
      const error = new Error("Payment reference mismatch. Please contact support.");
      error.code = "PAYMENT_REFERENCE_MISMATCH";
      error.statusCode = 409;
      throw error;
    }

    const currency = String(payData.currency || "NGN").toUpperCase();
    if (currency !== "NGN") {
      await this.recordPaymentAttemptEvent({
        reference,
        order,
        payData,
        status: "currency_mismatch",
        recoveryState: "review",
        type: "payment_currency_mismatch",
        message: "Provider currency does not match platform currency",
        metadata: { expectedCurrency: "NGN", providerCurrency: currency },
      });
      const error = new Error("Payment currency mismatch. Please contact support.");
      error.code = "PAYMENT_CURRENCY_MISMATCH";
      error.statusCode = 409;
      throw error;
    }

    const expectedKobo = Number(order.total || 0);
    const paidKobo = Number(payData.amount || 0);
    if (paidKobo !== expectedKobo) {
      await this.recordPaymentAttemptEvent({
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
          moneyUnit: "kobo",
        },
      });
      const error = new Error(
        `Payment amount mismatch. Expected ₦${(expectedKobo / 100).toLocaleString()}, received ₦${(paidKobo / 100).toLocaleString()}. Please contact support.`
      );
      error.code = "PAYMENT_AMOUNT_MISMATCH";
      error.statusCode = 409;
      throw error;
    }

    await this.recordPaymentAttemptEvent({
      reference,
      order,
      payData,
      status: "success",
      recoveryState: "awaiting_verification",
      type: "payment_verified",
      message: "Provider payment verified against backend order total; fulfillment pending Postgres migration",
      metadata: { expectedKobo, paidKobo, fulfillmentMigrated: false },
    });

    return { expectedKobo, paidKobo, paidAmount: paidKobo / 100 };
  },

  async markOrderPaymentFailed(order, payData = null) {
    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "failed",
        orderStatus: "failed",
      },
      include: {
        user: { select: { legacyMongoId: true } },
      },
    });

    await this.recordPaymentAttemptEvent({
      reference: order.paymentReference,
      order: updated,
      payData,
      status: "failed",
      recoveryState: "failed",
      type: "customer_payment_verify_failed",
      message: payData?.gateway_response || "Payment was not successful on provider",
    });

    return postgresOrderShape(updated);
  },

  async fulfillPaidOrder(reference) {
    if (!reference) throw new Error("Payment reference is required");

    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { paymentReference: reference },
        include: paidFulfillmentInclude,
      });
      if (!order) {
        const error = new Error("Postgres order not found for payment reference");
        error.code = "POSTGRES_ORDER_NOT_FOUND";
        error.statusCode = 404;
        throw error;
      }

      if (order.paymentStatus === "paid") {
        return {
          order: postgresOrderShape(order),
          idempotent: true,
          walletTransactions: [],
          creditedKobo: 0,
        };
      }

      if (order.paymentStatus === "failed" || order.paymentStatus === "refunded") {
        const error = new Error(`Cannot fulfill order with payment status ${order.paymentStatus}`);
        error.code = "POSTGRES_ORDER_NOT_FULFILLABLE";
        error.statusCode = 409;
        throw error;
      }

      let adminWallet = await tx.wallet.findFirst({
        where: { ownerModel: "Admin" },
        orderBy: { createdAt: "asc" },
      });
      if (!adminWallet) {
        const admin = await tx.admin.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (!admin) {
          const error = new Error("Admin wallet cannot be created because no active admin exists");
          error.code = "POSTGRES_ADMIN_WALLET_MISSING";
          error.statusCode = 409;
          throw error;
        }
        adminWallet = await tx.wallet.create({
          data: {
            ownerId: admin.id,
            ownerModel: "Admin",
            balance: 0,
            totalEarned: 0,
          },
        });
      }

      const updatedCount = await tx.order.updateMany({
        where: {
          id: order.id,
          paymentStatus: { notIn: ["paid", "failed", "refunded"] },
        },
        data: {
          paymentStatus: "paid",
          orderStatus: "accepted",
          statusLog: appendEvent(order.statusLog, {
            type: "paid",
            message: "Payment verified and order accepted",
            metadata: { source: "postgres_payment_fulfillment" },
          }),
        },
      });

      if (!updatedCount.count) {
        const currentOrder = await tx.order.findUnique({
          where: { id: order.id },
          include: { user: { select: { legacyMongoId: true } } },
        });
        return {
          order: postgresOrderShape(currentOrder),
          idempotent: true,
          walletTransactions: [],
          creditedKobo: 0,
        };
      }

      const walletTransactions = [];
      const transactionData = [];
      const metadataBase = {
        source: "postgres_payment_fulfillment",
        reference,
        legacyOrderId: order.legacyMongoId,
        orderCode: order.orderCode,
      };

      for (const vendorOrder of order.vendorOrders || []) {
        const escrowAmount = Number(vendorOrder.escrowAmount || 0);
        if (escrowAmount <= 0) continue;
        transactionData.push({
          walletId: adminWallet.id,
          type: "credit",
          amount: escrowAmount,
          description: `Escrow: vendor food revenue held for Order ${order.orderCode}`,
          transactionType: "escrow_hold",
          orderId: order.id,
          metadata: {
            ...metadataBase,
            vendorOrderId: vendorOrder.id,
            legacyVendorOrderId: vendorOrder.legacyMongoId,
            vendorId: vendorOrder.restaurantId,
            legacyVendorId: vendorOrder.restaurant?.legacyMongoId,
            vendorName: vendorOrder.restaurant?.storeName || "",
          },
        });
      }

      for (const fee of order.vendorDeliveryFees || []) {
        const deliveryAmount = Number(fee.deliveryFee || 0);
        if (deliveryAmount <= 0) continue;
        transactionData.push({
          walletId: adminWallet.id,
          type: "credit",
          amount: deliveryAmount,
          description: `Delivery fee received - Order ${order.orderCode}`,
          transactionType: "delivery_fee",
          orderId: order.id,
          metadata: {
            ...metadataBase,
            vendorId: fee.restaurantId,
            legacyVendorId: fee.restaurant?.legacyMongoId,
            vendorName: fee.restaurant?.storeName || "",
          },
        });
      }

      const serviceFee = Number(order.serviceFee || 0);
      if (serviceFee > 0) {
        transactionData.push({
          walletId: adminWallet.id,
          type: "credit",
          amount: serviceFee,
          description: `Service fee collected for Order ${order.orderCode}`,
          transactionType: "service_fee",
          orderId: order.id,
          metadata: metadataBase,
        });
      }

      const creditedKobo = transactionData.reduce((sum, txRow) => sum + Number(txRow.amount || 0), 0);
      if (creditedKobo > 0) {
        await tx.wallet.update({
          where: { id: adminWallet.id },
          data: { balance: { increment: creditedKobo } },
        });

        for (const txRow of transactionData) {
          const created = await tx.walletTransaction.create({ data: txRow });
          walletTransactions.push({
            id: created.id,
            type: created.type,
            amount: created.amount,
            transactionType: created.transactionType,
          });
        }
      }

      let invoice = await tx.invoice.findFirst({
        where: { type: "order", orderId: order.id },
        select: { id: true, invoiceNumber: true, amount: true },
      });
      if (!invoice) {
        invoice = await tx.invoice.create({
          data: {
            invoiceNumber: nextInvoiceNumber("order"),
            userId: order.userId,
            type: "order",
            orderId: order.id,
            paymentReference: order.paymentReference || "",
            amount: toBigIntKobo(order.total),
            lines: orderInvoiceLines(order),
            metadata: {
              orderCode: order.orderCode,
              legacyOrderId: order.legacyMongoId,
              legacyUserId: order.user?.legacyMongoId,
              status: "paid",
              currency: "NGN",
              subtotal: order.subtotal,
              deliveryFee: order.deliveryFee,
              serviceFee: order.serviceFee,
              paidAt: new Date().toISOString(),
              customer: customerFromPostgres(order.user, order.deliveryAddress),
              source: "postgres_payment_fulfillment",
            },
          },
          select: { id: true, invoiceNumber: true, amount: true },
        });
      }

      const existingAttempt = await tx.paymentAttempt.findUnique({
        where: { reference },
        select: { events: true },
      });
      await tx.paymentAttempt.update({
        where: { reference },
        data: {
          status: "recovered",
          recoveryState: "recovered",
          events: appendEvent(existingAttempt?.events, {
            type: "order_fulfillment_created",
            message: "Postgres paid-order fulfillment created admin wallet credits and order invoice",
            metadata: { creditedKobo, walletTransactionCount: walletTransactions.length, invoiceNumber: invoice.invoiceNumber },
          }),
        },
      });

      const fulfilledOrder = await tx.order.findUnique({
        where: { id: order.id },
        include: { user: { select: { legacyMongoId: true } } },
      });

      return {
        order: postgresOrderShape(fulfilledOrder),
        idempotent: false,
        walletTransactions,
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: Number(invoice.amount || 0),
        },
        creditedKobo,
      };
    });
  },
};
