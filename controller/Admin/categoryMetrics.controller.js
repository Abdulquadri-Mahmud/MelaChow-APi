// controller/Admin/categoryMetrics.controller.js
import MenuItem from "../../model/menu/MenuItem.js";
import Category from "../../model/category.model.js";

/**
 * Get Category Analytics (Inventory Distribution)
 */
export const getCategoryMetrics = async (req, res) => {
    try {
        const categories = await Category.find({ isActive: true });
        const result = [];

        for (const cat of categories) {
            const count = await MenuItem.countDocuments({
                platform_category_id: cat._id,
                is_archived: false
            });

            if (count > 0) {
                result.push({
                    name: cat.name,
                    count: count
                });
            }
        }
        
        // Sort by count descending
        result.sort((a, b) => b.count - a.count);

        res.status(200).json({ success: true, distribution: result });
    } catch (err) {
        console.error("Category Analytics Error: ", err);
        res.status(500).json({ success: false, message: "Error fetching category metrics", error: err.message });
    }
};
