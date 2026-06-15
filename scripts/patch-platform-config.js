/**
 * One-time patch script — run once to ensure the PlatformConfig singleton
 * has the riderMinPayoutBalance field set to ₦500.
 *
 * Usage: node scripts/patch-platform-config.js
 */

import "dotenv/config";
import mongoose from "mongoose";
import PlatformConfig from "../model/platform/PlatformConfig.model.js";

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("❌ MONGODB_URI is not set in environment variables.");
    process.exit(1);
}

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const result = await PlatformConfig.findOneAndUpdate(
        { type: "singleton" },
        {
            $setOnInsert: { type: "singleton" },
            $set: { riderMinPayoutBalance: 500 },
        },
        { upsert: true, new: true }
    );

    console.log("✅ PlatformConfig patched successfully:");
    console.log(`   riderMinPayoutBalance : ₦${result.riderMinPayoutBalance}`);
    console.log(`   riderFixedPayout      : ₦${result.riderFixedPayout}`);
    console.log(`   riderPayoutHour       : ${result.riderPayoutHour}:00`);

    await mongoose.disconnect();
    console.log("✅ Done. Connection closed.");
}

run().catch((err) => {
    console.error("❌ Script failed:", err.message);
    process.exit(1);
});
