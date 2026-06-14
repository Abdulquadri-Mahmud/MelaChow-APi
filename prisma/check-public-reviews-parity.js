import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import Reviews from "../model/reviews/review.model.js";
import Vendor from "../model/vendor/vendor.model.js";
import MenuItem from "../model/menu/MenuItem.js";
import {
  getRestaurantReviews,
  getFoodReviews,
  getRestaurantReviewsSummary,
} from "../controller/user/public.reviews.controller.js";

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

const invoke = async ({ provider, handler, params, query = {} }) => {
  process.env.DB_PUBLIC_REVIEW_READ_PROVIDER = provider;
  const req = { params, query };
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

    const vendor = await Vendor.findById(review.vendorId).lean();
    const food = review.foodId ? await MenuItem.findById(review.foodId).lean() : await MenuItem.findOne({ vendor_id: review.vendorId }).lean();
    if (!vendor) throw new Error("Sample review vendor not found");

    const results = [
      await runCompare("public vendor reviews", {
        handler: getRestaurantReviews,
        params: { vendorId: String(vendor._id) },
        query: { page: 1, limit: 5 },
      }),
      await runCompare("public vendor reviews summary", {
        handler: getRestaurantReviewsSummary,
        params: { vendorId: String(vendor._id) },
      }),
    ];

    if (food) {
      results.push(
        await runCompare("public food reviews", {
          handler: getFoodReviews,
          params: { foodId: String(food._id) },
          query: { page: 1, limit: 5 },
        })
      );
    }

    console.log(JSON.stringify({ sample: { vendorId: String(vendor._id), foodId: food ? String(food._id) : null }, results }, null, 2));
  } finally {
    process.env.DB_PUBLIC_REVIEW_READ_PROVIDER = "postgres";
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error("Public reviews parity check failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
