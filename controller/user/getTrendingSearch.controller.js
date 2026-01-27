import Food from "../../model/vendor/food.model.js";

/**
 * @desc    Get trending food searches/items
 * @route   GET /api/user/trending
 * @access  Public
 */
export const getTrendingSearch = async (req, res) => {
    try {
        // Trending logic: High rating + High rating count + Available
        // Sorting by ratingCount and rating to find "popular" items
        const trendingFoods = await Food.find({
            available: true,
        })
            .populate({
                path: "vendor",
                select: "storeName logo address rating openingHours",
            })
            .sort({ ratingCount: -1, rating: -1 })
            .limit(10)
            .lean();

        const formattedFoods = trendingFoods.map((food) => {
            const vendor = food.vendor || {};
            return {
                _id: food._id,
                name: food.name,
                slug: food.slug,
                price: food.price,
                deliveryFee: food.deliveryFee || 0,
                image: food.images?.[0]?.url || food.images?.[0] || "",
                rating: food.rating,
                ratingCount: food.ratingCount,
                category: food.category,
                restaurant: {
                    _id: vendor._id,
                    storeName: vendor.storeName,
                    logo: vendor.logo,
                    city: vendor.address?.city,
                    state: vendor.address?.state,
                    openingHours: vendor.openingHours,
                },
            };
        });

        return res.json({
            success: true,
            count: formattedFoods.length,
            trending: formattedFoods,
        });
    } catch (error) {
        console.error("GetTrendingSearch Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server Error",
        });
    }
};
