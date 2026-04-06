import mongoose from "mongoose";
import dotenv from "dotenv";
import Vendor from "../model/vendor/vendor.model.js";
import Food from "../model/vendor/food.model.js";

dotenv.config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.DATABASE_URL || "mongodb://localhost:27017/melachow");
        console.log("Connected to MongoDB for migration...");

        // 1. Migrate Vendors
        console.log("Migrating Vendors...");
        const vendors = await Vendor.find({});
        for (const vendor of vendors) {
            // Set default delivery fields if missing
            if (vendor.acceptsDelivery === undefined) {
                vendor.acceptsDelivery = true;
            }
            if (vendor.flatRateDeliveryFee === undefined) {
                vendor.flatRateDeliveryFee = 0;
            }

            // Remove coordinates if they exist (Mongoose will handle this on save if schema changed, 
            // but let's be explicit with .set() if we want to be sure or just save)
            // Since coordinates is now removed from schema, saving the document will likely strip it
            // unless we use $unset via updateMany. Let's use updateMany for cleaner removal.

            await vendor.save();
        }

        // Explicitly unset coordinates for all vendors
        await Vendor.collection.updateMany({}, { $unset: { "address.coordinates": "" } });
        console.log("Vendors migrated.");

        // 2. Migrate Foods
        console.log("Migrating Foods...");
        const foods = await Food.find({});
        for (const food of foods) {
            if (food.category && !food.categories) {
                // Map old category to new structure
                // If the old category isn't in our new ROOT_CATEGORIES, we might want to map it to "Others"
                const OLD_TO_ROOT = {
                    "Rice Dishes": "Main Course",
                    "Swallow": "Traditional",
                    "Soups & Stews": "Traditional",
                    "Beans Dishes": "Main Course",
                    "Yam Dishes": "Main Course",
                    "Plantain Dishes": "Main Course",
                    "Pasta": "Main Course",
                    "Snacks": "Snacks",
                    "Grills & Barbecue": "Main Course",
                    "Shawarma": "Fast Food",
                    "Breakfast": "Main Course",
                    "Drinks": "Drinks",
                    "Desserts": "Desserts",
                    "Seafood": "Seafood",
                    "Vegetarian": "Vegetarian",
                    "Salads": "Main Course",
                    "Small Chops": "Snacks",
                    "Porridge": "Main Course",
                    "Native Delicacies": "Traditional",
                    "Others": "Others"
                };

                const rootCat = OLD_TO_ROOT[food.category] || "Others";
                const subCat = food.category || "General";

                food.categories = [rootCat, subCat];
                // We'll unset the old 'category' field later or Mongoose might keep it if it's still in the doc instance
                await food.save();
            }
        }

        // Explicitly unset the old 'category' field for all foods
        await Food.collection.updateMany({}, { $unset: { category: "" } });
        console.log("Foods migrated.");

        console.log("Migration completed successfully!");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
};

migrate();

