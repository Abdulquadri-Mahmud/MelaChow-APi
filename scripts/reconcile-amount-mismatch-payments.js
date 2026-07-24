/**
 * Reconciliation Audit Script for Paystack Payment Amount Mismatch Orders.
 *
 * Scans PaymentAttempt and Order records stuck in 'amount_mismatch' status.
 * Re-queries Paystack API for verification and fee details:
 * - If fees is null/missing -> flags as MANUAL_REVIEW_FEES_MISSING.
 * - If paidKobo === expectedKobo + feesKobo (customer bearer mode) or paidKobo === expectedKobo ->
 *   Executes FULL order fulfillment (updateOrderAfterPayment / fulfillPaidOrder),
 *   which updates order paymentStatus to 'paid', creates vendor orders, updates vendor wallets,
 *   and broadcasts order notifications to vendors.
 *
 * Usage:
 *   node scripts/reconcile-amount-mismatch-payments.js [--dry-run]
 */

import "dotenv/config";
import mongoose from "mongoose";
import axios from "axios";

// Silence background Redis queue connection errors if local Redis server is inactive
process.on("uncaughtException", (err) => {
  if (err?.code === "ECONNREFUSED" && err?.port === 6379) return;
  console.error("Uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  if (reason?.code === "ECONNREFUSED" && reason?.port === 6379) return;
});

import PaymentAttempt from "../model/order/PaymentAttempt.js";
import Order from "../model/order/Order.js";
import { updateOrderAfterPayment } from "../controller/order/createOrderV2.controller.js";
import { postgresPaymentRepository } from "../services/postgres/payment.repository.js";
import { validateSuccessfulPaymentForOrder } from "../services/paymentHardening.service.js";

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const isDryRun = process.argv.includes("--dry-run");

if (!PAYSTACK_SECRET_KEY) {
  console.error("❌ PAYSTACK_SECRET_KEY is not set in environment variables.");
  process.exit(1);
}

async function verifyPaystackReference(reference) {
  try {
    const res = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });
    return res.data?.data || null;
  } catch (err) {
    console.error(`❌ Paystack verify call failed for reference ${reference}:`, err.response?.data?.message || err.message);
    return null;
  }
}

async function run() {
  console.log(`🔍 Starting Paystack Amount Mismatch Reconciliation Audit ${isDryRun ? "[DRY RUN]" : ""}`);

  if (MONGO_URI) {
    try {
      await mongoose.connect(MONGO_URI);
      console.log("✅ Connected to MongoDB");
    } catch (e) {
      console.warn("⚠️ Could not connect to MongoDB:", e.message);
    }
  }

  // Find all payment attempts marked as amount_mismatch
  const attempts = await PaymentAttempt.find({
    $or: [{ status: "amount_mismatch" }, { "events.type": "payment_amount_mismatch" }],
  }).lean();

  console.log(`📋 Found ${attempts.length} payment attempt(s) with amount_mismatch records.`);

  const summary = {
    totalEvaluated: attempts.length,
    reconciledAndFulfilled: 0,
    manualReviewFeesMissing: 0,
    genuineMismatches: 0,
    alreadyPaid: 0,
    errors: 0,
    details: [],
  };

  for (const attempt of attempts) {
    const reference = attempt.reference;
    console.log(`\n--------------------------------------------------`);
    console.log(`🔎 Evaluating Reference: ${reference}`);

    const mongoOrder = await Order.findOne({ paymentReference: reference });
    if (mongoOrder && mongoOrder.paymentStatus === "paid") {
      console.log(`ℹ️ Order ${mongoOrder.orderId} is ALREADY paid. Skipping fulfillment.`);
      summary.alreadyPaid++;
      summary.details.push({ reference, orderId: mongoOrder.orderId, status: "ALREADY_PAID" });
      continue;
    }

    const payData = await verifyPaystackReference(reference);
    if (!payData) {
      console.log(`❌ Could not fetch Paystack data for ${reference}`);
      summary.errors++;
      summary.details.push({ reference, status: "VERIFY_FETCH_FAILED" });
      continue;
    }

    const rawFees = payData.fees !== undefined && payData.fees !== null ? payData.fees : payData.fees_split?.paystack;
    const feesKobo = rawFees !== undefined && rawFees !== null ? Number(rawFees) : null;
    const paidKobo = Number(payData.amount || 0);

    if (feesKobo === null) {
      console.log(`⚠️ Transaction ${reference} is MISSING fees data on Paystack payload.`);
      summary.manualReviewFeesMissing++;
      summary.details.push({ reference, status: "MANUAL_REVIEW_FEES_MISSING", paidKobo, feesKobo });
      continue;
    }

    // Determine target order
    const orderRef = mongoOrder || (attempt.orderSnapshot ? { ...attempt.orderSnapshot, paymentReference: reference } : null);
    if (!orderRef) {
      console.log(`⚠️ No local Order or orderSnapshot found for reference ${reference}`);
      summary.errors++;
      summary.details.push({ reference, status: "ORDER_NOT_FOUND" });
      continue;
    }

    const expectedKobo = Math.round(Number(orderRef.total || attempt.expectedAmount || 0) * 100);
    const feeBearer = payData.metadata?.feeBearer || "customer";

    console.log(`   Order Code    : ${orderRef.orderId || attempt.orderCode}`);
    console.log(`   Expected Total: ₦${expectedKobo / 100}`);
    console.log(`   Provider Paid : ₦${paidKobo / 100}`);
    console.log(`   Paystack Fee  : ₦${feesKobo / 100}`);
    console.log(`   Fee Bearer    : ${feeBearer}`);

    let isValidMatch = false;
    if (feeBearer === "customer") {
      isValidMatch = paidKobo === expectedKobo + feesKobo || paidKobo === expectedKobo;
    } else {
      isValidMatch = paidKobo === expectedKobo;
    }

    if (!isValidMatch) {
      console.log(`❌ Genuine Mismatch detected for ${reference}: Expected ₦${(expectedKobo + (feeBearer === "customer" ? feesKobo : 0)) / 100}, got ₦${paidKobo / 100}`);
      summary.genuineMismatches++;
      summary.details.push({ reference, orderId: orderRef.orderId, status: "GENUINE_MISMATCH", expectedKobo, paidKobo, feesKobo });
      continue;
    }

    console.log(`✅ Payment MATCHES fee-aware validation for ${reference}!`);

    if (isDryRun) {
      console.log(`   [DRY RUN] Would execute full order fulfillment for ${reference}`);
      summary.reconciledAndFulfilled++;
      summary.details.push({ reference, orderId: orderRef.orderId, status: "RECONCILED_DRY_RUN" });
      continue;
    }

    try {
      if (mongoOrder) {
        console.log(`🚀 Executing full Mongo order fulfillment for ${mongoOrder.orderId}...`);
        await validateSuccessfulPaymentForOrder(mongoOrder, payData);
        await updateOrderAfterPayment(mongoOrder._id, reference);
        console.log(`🎉 Mongo Order ${mongoOrder.orderId} successfully reconciled and vendor notified!`);
      } else {
        console.log(`🚀 Executing Postgres order fulfillment for reference ${reference}...`);
        await postgresPaymentRepository.fulfillPaidOrder(reference);
        console.log(`🎉 Postgres Order ${reference} successfully reconciled!`);
      }

      await PaymentAttempt.findOneAndUpdate(
        { reference },
        {
          $set: { status: "recovered", recoveryState: "recovered" },
          $push: {
            events: {
              type: "manual_reconciliation_script_fulfilled",
              message: "Order successfully reconciled and fulfilled via script",
              metadata: { paidKobo, feesKobo, expectedKobo, feeBearer },
              at: new Date(),
            },
          },
        }
      );

      summary.reconciledAndFulfilled++;
      summary.details.push({ reference, orderId: orderRef.orderId, status: "RECONCILED_AND_FULFILLED" });
    } catch (fulfillErr) {
      console.error(`❌ Fulfillment failed for ${reference}:`, fulfillErr.message);
      summary.errors++;
      summary.details.push({ reference, orderId: orderRef.orderId, status: "FULFILLMENT_ERROR", error: fulfillErr.message });
    }
  }

  console.log(`\n==================================================`);
  console.log(`📊 RECONCILIATION AUDIT SUMMARY ${isDryRun ? "[DRY RUN]" : ""}`);
  console.log(`==================================================`);
  console.log(`Total Evaluated         : ${summary.totalEvaluated}`);
  console.log(`Reconciled & Fulfilled : ${summary.reconciledAndFulfilled}`);
  console.log(`Already Paid            : ${summary.alreadyPaid}`);
  console.log(`Fees Missing (Review)   : ${summary.manualReviewFeesMissing}`);
  console.log(`Genuine Mismatches      : ${summary.genuineMismatches}`);
  console.log(`Errors / Unresolved     : ${summary.errors}`);
  console.log(`==================================================\n`);

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error("❌ Reconciliation script failed:", err);
  process.exit(1);
});
