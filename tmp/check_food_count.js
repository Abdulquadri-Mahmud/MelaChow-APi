import mongoose from "mongoose";
import Food from "../model/vendor/food.model.js";
import dotenv from "dotenv";
dotenv.config();

const check = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const count = await Food.countDocuments();
        console.log(`foods collection count: ${count}`);
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
};

check();
