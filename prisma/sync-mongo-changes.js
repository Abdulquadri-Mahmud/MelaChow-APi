import "dotenv/config";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

const execFileAsync = promisify(execFile);
const JOB = "mongo-change-stream-v1";
const debounceMs = Math.max(1000, Number(process.env.POSTGRES_SYNC_DEBOUNCE_MS || 5000));

const scriptsByCollection = {
  users: ["import-users-from-mongo.js"],
  orders: ["import-orders-from-mongo.js", "import-vendor-orders-from-mongo.js", "import-logistics-support-from-mongo.js"],
  vendororders: ["import-vendor-orders-from-mongo.js", "import-logistics-support-from-mongo.js"],
  riders: ["import-logistics-support-from-mongo.js", "import-wallets-from-mongo.js"],
  riderassignments: ["import-logistics-support-from-mongo.js"],
  wallets: ["import-wallets-from-mongo.js"],
  withdrawals: ["import-wallets-from-mongo.js"],
  riderwithdrawals: ["import-wallets-from-mongo.js"],
  paymentattempts: ["import-finance-payments-from-mongo.js"],
  paymentlocks: ["import-finance-payments-from-mongo.js"],
  refunds: ["import-finance-payments-from-mongo.js"],
  transactions: ["import-finance-payments-from-mongo.js"],
  invoices: ["import-finance-payments-from-mongo.js"],
  reviews: ["import-reviews-from-mongo.js"],
  menuitems: ["import-menu-from-mongo.js"],
  menuitemportions: ["import-menu-from-mongo.js"],
  menuitemchoicegroups: ["import-menu-from-mongo.js"],
  menuitemchoiceoptions: ["import-menu-from-mongo.js"],
  comboitems: ["import-menu-from-mongo.js"],
  categories: ["import-menu-from-mongo.js"],
  vendors: ["import-menu-from-mongo.js", "import-wallets-from-mongo.js"],
};
const targetedScriptByCollection = {
  users: "import-users-from-mongo.js",
  orders: "import-orders-from-mongo.js",
  vendororders: "import-vendor-orders-from-mongo.js",
};
const deleteModelByCollection = {
  users: prisma.user,
  orders: prisma.order,
  vendororders: prisma.vendorOrder,
};

let timer = null;
let running = false;
const pendingScripts = new Set();
const pendingTargets = new Map();
const pendingDeletes = new Map();
let latestToken = null;
let sourceName = null;
let pollTimer = null;
let pollRunning = false;

const persistToken = async () => {
  if (!latestToken) return;
  await prisma.migrationCheckpoint.upsert({
    where: { jobName_sourceName: { jobName: JOB, sourceName } },
    create: { jobName: JOB, sourceName, metadata: { resumeToken: latestToken } },
    update: { metadata: { resumeToken: latestToken }, processed: { increment: 1 } },
  });
};

const flush = async () => {
  if (running || pendingScripts.size === 0) return;
  running = true;
  const scripts = [...pendingScripts];
  const targets = new Map(pendingTargets);
  const deletes = new Map(pendingDeletes);
  pendingScripts.clear();
  pendingTargets.clear();
  pendingDeletes.clear();
  try {
    for (const [collection, ids] of deletes) {
      const model = deleteModelByCollection[collection];
      for (const legacyMongoId of ids) await model.deleteMany({ where: { legacyMongoId } });
    }
    for (const script of scripts) {
      const ids = targets.get(script);
      const targeted = ids && ids.size > 0 && ids.size <= 100;
      const runs = targeted ? [...ids].map((id) => [`prisma/${script}`, `--id=${id}`]) : [[`prisma/${script}`, "--restart"]];
      for (const args of runs) {
        const { stdout } = await execFileAsync(process.execPath, args, { cwd: process.cwd(), timeout: 300000, maxBuffer: 2_000_000 });
        console.log(`[sync] ${script}: ${stdout.trim()}`);
      }
    }
    await persistToken();
  } catch (error) {
    console.error("[sync] refresh failed; resume token not advanced:", error.message);
    for (const script of scripts) pendingScripts.add(script);
    for (const [script, ids] of targets) {
      if (!pendingTargets.has(script)) pendingTargets.set(script, new Set());
      for (const id of ids) pendingTargets.get(script).add(id);
    }
    for (const [collection, ids] of deletes) {
      if (!pendingDeletes.has(collection)) pendingDeletes.set(collection, new Set());
      for (const id of ids) pendingDeletes.get(collection).add(id);
    }
  } finally {
    running = false;
    if (pendingScripts.size) timer = setTimeout(flush, debounceMs);
  }
};

const schedule = (collection, token, documentId, operationType) => {
  latestToken = token;
  if (operationType === "delete" && deleteModelByCollection[collection] && documentId) {
    if (!pendingDeletes.has(collection)) pendingDeletes.set(collection, new Set());
    pendingDeletes.get(collection).add(String(documentId));
  }
  for (const script of scriptsByCollection[collection] || []) {
    pendingScripts.add(script);
    if (targetedScriptByCollection[collection] === script && operationType !== "delete" && documentId) {
      if (!pendingTargets.has(script)) pendingTargets.set(script, new Set());
      pendingTargets.get(script).add(String(documentId));
    }
  }
  if (!pendingScripts.size) return;
  clearTimeout(timer);
  timer = setTimeout(flush, debounceMs);
};

const startUserPolling = () => {
  const intervalMs = Math.max(2000, Number(process.env.POSTGRES_SYNC_POLL_MS || 5000));
  let since = new Date();
  console.log(`[sync] MongoDB is standalone; polling user changes every ${intervalMs}ms`);

  pollTimer = setInterval(async () => {
    if (pollRunning) return;
    pollRunning = true;
    const cutoff = new Date();
    try {
      const changedUsers = await mongoose.connection.db
        .collection("users")
        .find({ updatedAt: { $gt: since, $lte: cutoff } }, { projection: { _id: 1 } })
        .toArray();
      since = cutoff;
      for (const user of changedUsers) schedule("users", null, user._id, "update");
      if (changedUsers.length) await flush();
    } catch (error) {
      console.error("[sync] user polling failed:", error.message);
    } finally {
      pollRunning = false;
    }
  }, intervalMs);
};

const main = async () => {
  if (process.env.POSTGRES_SYNC_ENABLED !== "true") throw new Error("POSTGRES_SYNC_ENABLED must be true");
  if (!process.env.MONGO_URI || !process.env.DATABASE_URL) throw new Error("MONGO_URI and DATABASE_URL are required");
  await mongoose.connect(process.env.MONGO_URI);
  sourceName = `database:${mongoose.connection.db.databaseName}`;
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName) {
    if (process.env.POSTGRES_SYNC_ALLOW_POLLING !== "true") {
      throw new Error("MongoDB change streams require a replica set; enable POSTGRES_SYNC_ALLOW_POLLING for local user sync");
    }
    startUserPolling();
    const shutdownPolling = async () => {
      clearInterval(pollTimer);
      await flush();
      await mongoose.disconnect();
      await prisma.$disconnect();
      process.exit(0);
    };
    process.on("SIGINT", shutdownPolling);
    process.on("SIGTERM", shutdownPolling);
    return;
  }
  const checkpoint = await prisma.migrationCheckpoint.findUnique({ where: { jobName_sourceName: { jobName: JOB, sourceName } } });
  const resumeToken = checkpoint?.metadata?.resumeToken;
  const stream = mongoose.connection.db.watch([], { fullDocument: "updateLookup", ...(resumeToken ? { resumeAfter: resumeToken } : {}) });
  console.log(`[sync] watching MongoDB database ${mongoose.connection.db.databaseName}`);
  stream.on("change", (change) => schedule(change.ns?.coll, change._id, change.documentKey?._id, change.operationType));
  stream.on("error", async (error) => {
    console.error("[sync] change stream error; exiting for supervised restart:", error.message);
    await mongoose.disconnect().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
  const shutdown = async () => { clearTimeout(timer); await flush(); await stream.close(); await mongoose.disconnect(); await prisma.$disconnect(); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  const probeMs = Number(process.env.POSTGRES_SYNC_PROBE_MS || 0);
  if (probeMs > 0) setTimeout(shutdown, probeMs);
};

main().catch(async (error) => {
  console.error("Mongo change synchronization failed:", error.message);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
