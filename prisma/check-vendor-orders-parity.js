import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import VendorOrder from "../model/vendor/VendorOrder.js";
import { getVendorOrderById, getVendorOrders } from "../controller/vendor/vendor.controller.js";

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

  if (left.type === "array" || right.type === "array") {
    if (left.type !== right.type) {
      diffs.push(`${path}: array mismatch`);
      return diffs;
    }
    if (left.length !== right.length) diffs.push(`${path}.length: ${left.length} !== ${right.length}`);
    return diffSignatures(left.sample, right.sample, `${path}[]`, diffs);
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

const invoke = async ({ provider, handler, vendor, params = {} }) => {
  process.env.DB_VENDOR_ORDER_READ_PROVIDER = provider;
  const req = { vendor, params };
  let statusCode = 200;
  let payload = null;
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

  await handler(req, res);
  return { statusCode, payload: JSON.parse(JSON.stringify(payload)) };
};

const runCompare = async (label, args) => {
  const mongoResponse = await invoke({ provider: "mongo", ...args });
  const postgresResponse = await invoke({ provider: "postgres", ...args });
  const diffs = diffSignatures(signature(mongoResponse), signature(postgresResponse));

  return {
    label,
    diffCount: diffs.length,
    diffs: diffs.slice(0, 80),
    status: {
      mongo: mongoResponse.statusCode,
      postgres: postgresResponse.statusCode,
    },
  };
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const sample = await VendorOrder.findOne({}).sort({ createdAt: -1 }).lean();
    if (!sample) throw new Error("No VendorOrder sample found");

    const vendor = { _id: sample.restaurantId };
    const results = [
      await runCompare("vendor order list", {
        handler: getVendorOrders,
        vendor,
      }),
      await runCompare("vendor order detail", {
        handler: getVendorOrderById,
        vendor,
        params: { vendorOrderId: String(sample._id) },
      }),
    ];

    console.log(JSON.stringify({ sample: { vendorId: String(sample.restaurantId), vendorOrderId: String(sample._id) }, results }, null, 2));
  } finally {
    process.env.DB_VENDOR_ORDER_READ_PROVIDER = "postgres";
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error("Vendor orders parity check failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
