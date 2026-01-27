import mongoose from "mongoose";
import dotenv from "dotenv";
import { seedCategories } from "./config/categorySeed.js";

dotenv.config();

const runSeed = async () => {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri) {
            throw new Error("MONGO_URI not found in environment variables");
        }

        console.log("Connecting to MongoDB...");
        await mongoose.connect(uri);
        console.log("Connected successfully.");

        await seedCategories();

        console.log("Closing connection...");
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    }
};

runSeed();
