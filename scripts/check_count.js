import mongoose from "mongoose";
import dotenv from "dotenv";
import Category from "./model/category.model.js";

dotenv.config();

const checkCount = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const count = await Category.countDocuments();
        console.log(`Current category count: ${count}`);
        await mongoose.connection.close();
    } catch (e) {
        console.error(e);
    }
};

checkCount();
