import Food from "../../model/vendor/food.model.js";
import User from "../../model/user.model.js";
import Vendor from "../../model/vendor/vendor.model.js";

/**
 * @desc    Get trending food searches/items
 * @route   GET /api/user/trending
 * @access  Public
 */
export const getTrendingSearch = async (req, res) => {
    try {
        // Get user's location from their default address
        let userCity = null;
        let userState = null;

        if (req.user?._id) {
            const user = await User.findById(req.user._id).select("addresses");

            if (user?.addresses?.length > 0) {
                const defaultAddress = user.addresses.find(a => a.isDefault) || user.addresses[0];
                userCity = defaultAddress.city?.trim() || null;
                userState = defaultAddress.state?.trim() || null;
            }
        }

        // Build vendor query with location filter
        let vendorQuery = {
            active: true,
            suspended: false,
            deletedAt: null,
        };

        // Filter vendors by user's location
        if (userCity || userState) {
            if (userCity) vendorQuery["address.city"] = { $regex: userCity, $options: "i" };
            if (userState) vendorQuery["address.state"] = { $regex: userState, $options: "i" };
        }

        // Find vendors in the user's location
        const vendors = await Vendor.find(vendorQuery).select("_id");

        if (vendors.length === 0 && (userCity || userState)) {
            return res.json({
                success: true,
                count: 0,
                trending: [],
                location: { city: userCity, state: userState },
                message: `No vendors found in ${userCity || ""} ${userState || ""}`.trim()
            });
        }

        const vendorIds = vendors.map(v => v._id);

        // Trending logic: High rating + High rating count + Available
        // Sorting by ratingCount and rating to find "popular" items
        const trendingFoods = await Food.find({
            available: true,
            ...(vendorIds.length > 0 ? { vendor: { $in: vendorIds } } : {})
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
            location: { city: userCity, state: userState }
        });
    } catch (error) {
        console.error("GetTrendingSearch Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server Error",
        });
    }
};

