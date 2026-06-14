import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import Rider from "../model/rider.model.js";
import Order from "../model/order/Order.js";
import RiderAssignment from "../model/riderAssignment.model.js";

import {
  getActiveOrder,
  getPendingOffers,
  getRiderOrderDetails,
  getRiderOrders,
} from "../controller/rider.controller.js";

const normalizeValue = (value) => {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return "date";
  if (value?._bsontype === "ObjectId") return "id";
  if (typeof value === "object" && typeof value.toString === "function" && value.constructor?.name === "ObjectId") return "id";
  return value;
};

const signature = (value) => {
  const normalized = normalizeValue(value);
  if (normalized === null) return "null";
  if (normalized === undefined) return "undefined";
  if (Array.isArray(normalized)) {
    return {
      type: "array",
      length: normalized.length,
      sample: normalized.length ? signature(normalized[0]) : null,
    };
  }
  if (typeof normalized !== "object") return typeof normalized;

  return Object.fromEntries(
    Object.keys(normalized)
      .sort()
      .map((key) => [key, signature(normalized[key])])
  );
};

const diffSignatures = (left, right, path = "$", diffs = []) => {
  if (typeof left !== typeof right) {
    diffs.push(`${path}: type ${typeof left} !== ${typeof right}`);
    return diffs;
  }

  if (!left || !right || typeof left !== "object") {
    if (left !== right) diffs.push(`${path}: ${left} !== ${right}`);
    return diffs;
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  for (const key of leftKeys.filter((key) => !rightKeys.includes(key))) {
    diffs.push(`${path}.${key}: missing in postgres`);
  }
  for (const key of rightKeys.filter((key) => !leftKeys.includes(key))) {
    diffs.push(`${path}.${key}: extra in postgres`);
  }
  for (const key of leftKeys.filter((key) => rightKeys.includes(key))) {
    diffSignatures(left[key], right[key], `${path}.${key}`, diffs);
  }
  return diffs;
};

const invoke = async ({ provider, handler, params }) => {
  process.env.DB_RIDER_READ_PROVIDER = provider;
  let statusCode = 200;
  let payload = null;
  const req = {
    params,
    query: {},
    rider: { _id: { toString: () => params.riderId } },
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return body;
    },
  };
  const next = (error) => {
    if (error) throw error;
  };

  await handler(req, res, next);
  return { statusCode, payload: JSON.parse(JSON.stringify(payload)) };
};

const runCompare = async (label, handler, params) => {
  const mongoResponse = await invoke({ provider: "mongo", handler, params });
  const postgresResponse = await invoke({ provider: "postgres", handler, params });
  const diffs = diffSignatures(signature(mongoResponse), signature(postgresResponse));

  return {
    label,
    diffCount: diffs.length,
    diffs,
    status: {
      mongo: mongoResponse.statusCode,
      postgres: postgresResponse.statusCode,
    },
  };
};

const findSamples = async () => {
  const fallbackRider = await Rider.findOne({ deletedAt: null }).sort({ createdAt: 1 }).lean();
  const activeRider = await Rider.findOne({ currentOrderId: { $ne: null }, deletedAt: null }).sort({ updatedAt: -1 }).lean();
  const pendingAssignment = await RiderAssignment.findOne({
    riderId: { $ne: null },
    status: "assigned",
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean();
  const assignedOrder = await Order.findOne({ riderId: { $ne: null } }).sort({ createdAt: -1 }).lean();

  return {
    activeRiderId: String(activeRider?._id || fallbackRider?._id || ""),
    pendingRiderId: String(pendingAssignment?.riderId || activeRider?._id || fallbackRider?._id || ""),
    orderRiderId: String(assignedOrder?.riderId || activeRider?._id || fallbackRider?._id || ""),
    orderId: assignedOrder?._id ? String(assignedOrder._id) : null,
  };
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const samples = await findSamples();
    const results = [
      await runCompare("rider active order", getActiveOrder, { riderId: samples.activeRiderId }),
      await runCompare("rider pending offers", getPendingOffers, { riderId: samples.pendingRiderId }),
      await runCompare("rider order list", getRiderOrders, { riderId: samples.orderRiderId }),
    ];

    if (samples.orderId) {
      results.push(
        await runCompare("rider order detail", getRiderOrderDetails, {
          riderId: samples.orderRiderId,
          orderId: samples.orderId,
        })
      );
    }

    console.log(JSON.stringify({ samples, results }, null, 2));
  } finally {
    process.env.DB_RIDER_READ_PROVIDER = "postgres";
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error("Rider self-service parity check failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
