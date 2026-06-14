import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import Reviews from "../model/reviews/review.model.js";
import {
  getAllVendorReviews,
  getUserReviews,
  getVendorReviews,
} from "../controller/user/user.reviews.controller.js";

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

const invoke = async ({ provider, handler, query = {}, vendor = null }) => {
  process.env.DB_REVIEW_READ_PROVIDER = provider;
  const req = { query, vendor };
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
    const review = await Reviews.findOne({}).lean();
    if (!review) throw new Error("No Mongo reviews found for sample");

    const vendor = { _id: review.vendorId };
    const results = [
      await runCompare("user reviews", {
        handler: getUserReviews,
        query: { userId: String(review.userId) },
      }),
      await runCompare("vendor reviews by query", {
        handler: getVendorReviews,
        query: { vendorId: String(review.vendorId) },
      }),
      await runCompare("vendor reviews by auth vendor", {
        handler: getVendorReviews,
        vendor,
      }),
      await runCompare("admin vendor reviews", {
        handler: getAllVendorReviews,
        query: { page: 1, limit: 5 },
      }),
      await runCompare("admin vendor reviews filtered", {
        handler: getAllVendorReviews,
        query: { vendorId: String(review.vendorId), rating: String(review.rating), page: 1, limit: 5 },
      }),
    ];

    console.log(JSON.stringify({ sample: { userId: String(review.userId), vendorId: String(review.vendorId) }, results }, null, 2));
  } finally {
    process.env.DB_REVIEW_READ_PROVIDER = "postgres";
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error("Review management parity check failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
