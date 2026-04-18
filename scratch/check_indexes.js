import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/melachow";

async function checkIndexes() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    const indexes = await mongoose.connection.collection("searchtrends").indexes();
    console.log("Current indexes on searchtrends:");
    console.log(JSON.stringify(indexes, null, 2));

    await mongoose.disconnect();
  } catch (err) {
    console.error("Error:", err);
  }
}

checkIndexes();
