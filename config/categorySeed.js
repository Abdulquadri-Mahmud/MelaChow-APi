import Category from "../model/category.model.js";

const DEFAULT_CATEGORIES = [
    { name: "Rice Dishes", subcategories: ["Jollof Rice", "Fried Rice", "White Rice", "Coconut Rice"] },
    { name: "Swallow", subcategories: ["Pounded Yam", "Amala", "Eba", "Fufu", "Semovita"] },
    { name: "Soups & Stews", subcategories: ["Egusi", "Ogbono", "Efo Riro", "Vegetable Soup", "Okra Soup", "Banga Soup"] },
    { name: "Beans Dishes", subcategories: ["Porridge Beans", "Ewa Agoyin", "Moin Moin", "Akara"] },
    { name: "Yam Dishes", subcategories: ["Fried Yam", "Boiled Yam", "Yam Porridge", "Roasted Yam"] },
    { name: "Plantain Dishes", subcategories: ["Dodo", "Boiled Plantain", "Roasted Plantain"] },
    { name: "Pasta", subcategories: ["Spaghetti", "Macaroni", "Indomie"] },
    { name: "Snacks", subcategories: ["Meat Pie", "Sausage Roll", "Chinchin", "Puff Puff"] },
    { name: "Grills & Barbecue", subcategories: ["Suya", "Grilled Fish", "Grilled Chicken", "Asun"] },
    { name: "Shawarma", subcategories: ["Chicken Shawarma", "Beef Shawarma", "Mixed Shawarma"] },
    { name: "Breakfast", subcategories: ["Tea & Bread", "Pancakes", "Omelette"] },
    { name: "Drinks", subcategories: ["Soda", "Juice", "Water", "Zobo", "Kunu"] },
    { name: "Desserts", subcategories: ["Ice Cream", "Cakes", "Fruit Salad"] },
    { name: "Seafood", subcategories: ["Fisherman Soup", "Peppered Snail"] },
    { name: "Vegetarian", subcategories: ["Salads", "Vegetable Stir-fry"] },
    { name: "Salads", subcategories: ["Coleslaw", "Potato Salad", "Mixed Green Salad"] },
    { name: "Small Chops", subcategories: ["Spring Rolls", "Samosa", "Chicken Wings"] },
    { name: "Porridge", subcategories: ["Potato Porridge"] },
    { name: "Native Delicacies", subcategories: ["Abacha", "Nkwobi", "Isiewu"] },
    { name: "Proteins", subcategories: ["Beef", "Goat Meat", "Fish", "Chicken", "Pork"] },
    { name: "Others", subcategories: ["General"] },
];

export const seedCategories = async () => {
    try {
        const count = await Category.countDocuments();
        // if (count > 0) {
        //     // console.log("Categories already exist, skipping seed.");
        //     return;
        // }

        console.log("🌱 Seeding default categories...");

        for (const cat of DEFAULT_CATEGORIES) {
            // Create root category
            let root = await Category.findOne({ name: cat.name });
            if (!root) {
                root = await Category.create({ name: cat.name, parent: null });
            }

            // Create subcategories
            for (const subName of cat.subcategories) {
                const sub = await Category.findOne({ name: subName, parent: root._id });
                if (!sub) {
                    await Category.create({ name: subName, parent: root._id });
                }
            }
        }

        console.log("✅ Categories seeded successfully!");
    } catch (error) {
        console.error("❌ Error seeding categories:", error.message);
    }
};
