import "dotenv/config";
import fs from "node:fs";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

const getReadOnlySourceUri = () => {
  if (process.env.SOURCE_MONGO_URI) return process.env.SOURCE_MONGO_URI;
  const lines = fs.readFileSync(".env", "utf8").split(/\r?\n/);
  const candidates = lines
    .map((line) => line.match(/^\s*MONGO_URI\s*=\s*(.+?)\s*$/)?.[1])
    .filter(Boolean);
  return candidates.find((uri) => !/mongodb:\/\/(localhost|127\.0\.0\.1)(:|\/)/i.test(uri));
};

const sourceUri = getReadOnlySourceUri();
if (!sourceUri) throw new Error("A non-local SOURCE_MONGO_URI is required for password recovery");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const source = mongoose.createConnection(sourceUri, {
  readPreference: "secondaryPreferred",
  serverSelectionTimeoutMS: 15000,
});

const stats = { sourceHashes: 0, matchedUsers: 0, updatedUsers: 0, invalidHashesSkipped: 0 };

try {
  await source.asPromise();
  const cursor = source.db.collection("users").find(
    { password: { $type: "string", $ne: "" } },
    { projection: { _id: 0, email: 1, password: 1 } },
  );

  for await (const record of cursor) {
    stats.sourceHashes += 1;
    const email = String(record.email || "").trim().toLowerCase();
    const passwordHash = String(record.password || "");
    if (!email || !/^\$2[aby]\$\d{2}\$/.test(passwordHash)) {
      stats.invalidHashesSkipped += 1;
      continue;
    }
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, password: true } });
    if (!existing) continue;
    stats.matchedUsers += 1;
    if (existing.password !== passwordHash) {
      await prisma.user.update({ where: { id: existing.id }, data: { password: passwordHash } });
      stats.updatedUsers += 1;
    }
  }

  console.log(JSON.stringify({ success: true, stats }, null, 2));
} finally {
  await source.close().catch(() => {});
  await prisma.$disconnect().catch(() => {});
}
