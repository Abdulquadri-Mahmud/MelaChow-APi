import Food from "../../model/vendor/food.model.js";
import Vendor from "../../model/vendor/vendor.model.js";

/**
 * @desc    Get foods by location (City & State)
 * @route   GET /api/user/foods
 * @access  Public
 */
export const getFoodsByLocation = async (req, res) => {
    try {
        const { city, state } = req.query;

        // 1. Validation
        if (!city || !state) {
            return res.status(400).json({
                success: false,
                message: "Please provide both city and state query parameters.",
            });
        }

        // 2. Normalize inputs for case-insensitive search (Relaxed regex to handle whitespace in DB)
        const cityRegex = new RegExp(`^\\s*${city.trim()}\\s*$`, "i");
        const stateRegex = new RegExp(`^\\s*${state.trim()}\\s*$`, "i");

        // 3. Find Vendors in the location
        // Must be active and not suspended (and verified usually)
        const vendors = await Vendor.find({
            "address.city": cityRegex,
            "address.state": stateRegex,
            active: true,
            suspended: false,
            deletedAt: null, // Ensure not soft-deleted
        }).select("_id");

        if (!vendors.length) {
            return res.json({
                success: true,
                location: { city, state },
                count: 0,
                foods: [],
                message: "No vendors found in this location.",
            });
        }

        const vendorIds = vendors.map((v) => v._id);

        // 4. Fetch Foods from these vendors
        // Populate vendor details properly
        const foods = await Food.find({
            vendor: { $in: vendorIds },
            available: true,
        })
            .populate({
                path: "vendor",
                select: "storeName address.city address.state logo openingHours",
            })
            .lean(); // Convert to plain JS objects for better performance

        // 5. Format Response
        const formattedFoods = foods.map((food) => {
            // Handle populate vendor (sometimes it might be null if vendor deleted but food remains - edge case)
            const vendor = food.vendor || {};

            return {
                _id: food._id,
                name: food.name,
                slug: food.slug,
                price: food.price,
                deliveryFee: food.deliveryFee || 0,
                image: food.images?.[0]?.url || food.images?.[0] || "", // Handle image array
                variantImage: food.variants?.[0]?.image || "",
                description: food.description,
                rating: food.rating,
                estimatedDeliveryTime: food.estimatedDeliveryTime,
                categories: food.categories,
                portions: food.portions || [],
                choiceGroups: food.choiceGroups || [],
                availabilitySchedule: food.availabilitySchedule || {},
                discount: food.discount || {},
                restaurant: {
                    _id: vendor._id,
                    storeName: vendor.storeName,
                    city: vendor.address?.city,
                    state: vendor.address?.state,
                    logo: vendor.logo,
                    openingHours: vendor.openingHours,
                },
            };
        });
        
        return res.json({
            success: true,
            location: { city, state },
            count: formattedFoods.length,
            foods: formattedFoods,
        });
    } catch (error) {
        console.error("GetFoodsByLocation Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server Error",
        });
    }
};
