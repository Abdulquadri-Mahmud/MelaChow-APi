import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import Wallet from "../model/wallet/wallet.mode.js";
import Rider from "../model/rider.model.js";

import { getUserWallet } from "../controller/user/wallet.controller.js";
import { getWalletForVendor, getVendorPayoutDetails } from "../controller/vendor/vendor.controller.js";
import { getWithdrawalHistory } from "../controller/wallet/withdrawal.controller.js";
import { getRiderWallet } from "../controller/rider.controller.js";
import { getRiderBankAccount, getRiderWithdrawalHistory } from "../controller/rider/riderWithdrawal.controller.js";

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

const invoke = async ({ provider, handler, req }) => {
  process.env.DB_WALLET_READ_PROVIDER = provider;
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
  const next = (error) => {
    if (error) throw error;
  };

  await handler(req, res, next);
  return { statusCode, payload: JSON.parse(JSON.stringify(payload)) };
};

const runCompare = async (label, handler, req) => {
  const mongoResponse = await invoke({ provider: "mongo", handler, req });
  const postgresResponse = await invoke({ provider: "postgres", handler, req });
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
  const userWallet = await Wallet.findOne({ ownerModel: "User" }).sort({ createdAt: 1 }).lean();
  const vendorWallet = await Wallet.findOne({ ownerModel: "Vendor" }).sort({ createdAt: 1 }).lean();
  const riderWallet = await Wallet.findOne({ ownerModel: "Rider" }).sort({ createdAt: 1 }).lean();
  let rider = riderWallet
    ? await Rider.findById(riderWallet.ownerId).lean()
    : await Rider.findOne({ deletedAt: null }).sort({ createdAt: 1 }).lean();
  if (!rider) {
    rider = await Rider.findOne({ deletedAt: null }).sort({ createdAt: 1 }).lean();
  }

  return {
    userId: String(userWallet?.ownerId || ""),
    vendorId: String(vendorWallet?.ownerId || ""),
    riderId: String(rider?._id || ""),
  };
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const samples = await findSamples();
    const results = [
      await runCompare("user wallet", getUserWallet, { userId: samples.userId }),
      await runCompare("vendor wallet", getWalletForVendor, { vendor: { _id: samples.vendorId } }),
      await runCompare("vendor payout details", getVendorPayoutDetails, { vendor: { _id: samples.vendorId } }),
      await runCompare("vendor withdrawal history", getWithdrawalHistory, { vendor: { _id: samples.vendorId } }),
      await runCompare("rider wallet", getRiderWallet, {
        params: { riderId: samples.riderId },
        rider: { _id: { toString: () => samples.riderId } },
      }),
      await runCompare("rider bank account", getRiderBankAccount, {
        params: { riderId: samples.riderId },
        rider: { _id: { toString: () => samples.riderId } },
      }),
      await runCompare("rider withdrawal history", getRiderWithdrawalHistory, {
        params: { riderId: samples.riderId },
        rider: { _id: { toString: () => samples.riderId } },
      }),
    ];

    console.log(JSON.stringify({ samples, results }, null, 2));
  } finally {
    process.env.DB_WALLET_READ_PROVIDER = "postgres";
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error("Wallet parity check failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
