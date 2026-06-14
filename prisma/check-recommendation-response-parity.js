import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import Vendor from "../model/vendor/vendor.model.js";
import { getRecommendations } from "../controller/recommendation/recommendation.controller.js";

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

const invokeRecommendations = async ({ provider, query }) => {
  process.env.DB_RECOMMENDATION_READ_PROVIDER = provider;

  const req = {
    query,
    user: null,
  };

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

  await getRecommendations(req, res);
  return { statusCode, payload };
};

const sectionCounts = (response) =>
  Object.fromEntries(
    Object.entries(response.payload?.data || {}).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])
  );

const runCompare = async (label, query) => {
  const mongoResponse = await invokeRecommendations({ provider: "mongo", query });
  const postgresResponse = await invokeRecommendations({ provider: "postgres", query });
  const diffs = diffSignatures(signature(mongoResponse), signature(postgresResponse));

  return {
    label,
    diffCount: diffs.length,
    diffs: diffs.slice(0, 80),
    counts: {
      mongo: sectionCounts(mongoResponse),
      postgres: sectionCounts(postgresResponse),
    },
  };
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const vendor = await Vendor.findOne({ active: true, suspended: false, deletedAt: null }).lean();
    const city = vendor?.address?.city;
    const state = vendor?.address?.state;
    if (!city || !state) throw new Error("No active vendor with address city/state found for sample");

    const results = [
      await runCompare("recommendations by location", { city, state }),
      await runCompare("weather recommendations", { city, state, weather: "rain" }),
    ];

    console.log(JSON.stringify({ sample: { city, state }, results }, null, 2));
  } finally {
    process.env.DB_RECOMMENDATION_READ_PROVIDER = "postgres";
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error("Recommendation parity check failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
