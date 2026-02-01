import Food from "../../model/vendor/food.model.js";
import Vendor from "../../model/vendor/vendor.model.js";
import Order from "../../model/order/Order.js";

/**
 * 🛠 Time-of-Day Logic
 * Returns a label and associated tags based on current server hour.
 */
const getTimeOfDayContext = () => {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 11) {
        return { label: "Breakfast", tags: ["Breakfast", "Coffee", "Egg", "Pancakes", "Tea", "Bread"] };
    } else if (hour >= 11 && hour < 16) {
        return { label: "Lunch", tags: ["Rice", "Pasta", "Sandwich", "Salad", "Amala", "Swallow"] };
    } else if (hour >= 16 && hour < 22) {
        return { label: "Dinner", tags: ["Soup", "Grill", "Steak", "Dinner", "Suya", "Fish"] };
    } else {
        return { label: "Late Night", tags: ["Snacks", "Fast Food", "Noodles", "Burger", "Pizza"] };
    }
};

/**
 * 🌦 Weather Logic
 * Maps a simple weather condition string to food tags.
 */
const getWeatherTags = (condition) => {
    const map = {
        rain: ["Soup", "Hot", "Tea", "Coffee", "Pepper soup", "Ramen"],
        cold: ["Soup", "Spicy", "Hot", "Tea"],
        hot: ["Ice cream", "Cold drink", "Salad", "Juice", "Smoothie", "Parfait"],
        cloudy: ["Coffee", "Tea", "Bakery"],
        clear: ["Grill", "Barbecue", "Picnic"]
    };
    return map[condition?.toLowerCase()] || [];
};

/**
 * 📍 Recommendation Controller
 */
export const getRecommendations = async (req, res) => {
    try {
        // 1. Establish User Context (Location)
        let { city, state, weather } = req.query;

        // Fallback to authenticated user's default address if not provided in query
        if ((!city || !state) && req.user && req.user.addresses && req.user.addresses.length > 0) {
            const defaultAddr = req.user.addresses.find(a => a.isDefault) || req.user.addresses[0];
            if (!city) city = defaultAddr.city;
            if (!state) state = defaultAddr.state;
        }

        // Normalize location for regex
        const cityRegex = city ? new RegExp(city.trim(), "i") : null;
        const stateRegex = state ? new RegExp(state.trim(), "i") : null;

        // If no location context is found, we can't do location-based recs effectively.
        // We will return generic global results or empty arrays for location-specific sections.
        const hasLocation = cityRegex || stateRegex;

        // Parallel fetch preparation
        const promises = {};

        // --- A. Time-of-Day Recommendations ---
        const timeContext = getTimeOfDayContext();
        const timeQuery = {
            available: true,
            tags: { $in: timeContext.tags.map(t => new RegExp(t, "i")) }
        };
        // If we have location, find vendors in that location first
        // Note: To be efficient, we might want to query Foods directly and populate Vendor.
        // However, filtering Food by Vendor's location requires knowing Vendor IDs or populating.
        // Efficient strategy: Find active vendors in location first.
        let locationVendorIds = [];
        if (hasLocation) {
            const vendorQuery = { active: true, suspended: false, deletedAt: null };
            if (cityRegex) vendorQuery["address.city"] = cityRegex;
            if (stateRegex) vendorQuery["address.state"] = stateRegex;

            const vendors = await Vendor.find(vendorQuery).select("_id").lean();
            locationVendorIds = vendors.map(v => v._id);

            // If no vendors in location, we might return empty for all location-based fields
            if (locationVendorIds.length > 0) {
                timeQuery.vendor = { $in: locationVendorIds };
            } else {
                // Location provided but no vendors? Return empty.
                return res.json({
                    timeOfDay: [], underrated: [], weatherBased: [], trendingNearby: [], budgetFriendly: [],
                    meta: { ...timeContext, city, state }
                });
            }
        }

        promises.timeOfDay = Food.find(timeQuery)
            .select("name slug price images vendor rating ratingCount tags")
            .populate("vendor", "storeName logo address")
            .sort({ ratingCount: -1 }) // simple popularity sort
            .limit(6)
            .lean();


        // --- B. Nearby Underrated Vendors (Foods from them) ---
        // Logic: Vendors in location with Rating >= 4.0 AND RatingCount < 50
        const underratedQuery = {
            available: true,
            rating: { $gte: 4.0 },
            ratingCount: { $lt: 50 } // "Hidden gems"
        };
        if (locationVendorIds.length > 0) {
            underratedQuery.vendor = { $in: locationVendorIds };
        }
        promises.underrated = Food.find(underratedQuery)
            .select("name slug price images vendor rating ratingCount")
            .populate("vendor", "storeName logo address")
            .sort({ rating: -1 }) // Sort by quality, even if few ratings
            .limit(6)
            .lean();


        // --- C. Weather-Based ---
        const weatherTags = getWeatherTags(weather);
        if (weatherTags.length > 0) {
            const weatherQuery = {
                available: true,
                tags: { $in: weatherTags.map(t => new RegExp(t, "i")) }
            };
            if (locationVendorIds.length > 0) {
                weatherQuery.vendor = { $in: locationVendorIds };
            }
            promises.weatherBased = Food.find(weatherQuery)
                .select("name slug price images vendor")
                .populate("vendor", "storeName logo address")
                .limit(6)
                .lean();
        } else {
            promises.weatherBased = Promise.resolve([]);
        }


        // --- D. Trending Nearby (People ordered this) ---
        // This requires aggregation on Orders.
        // 1. Match Orders in last 48 hours & in user's city
        // 2. Unwind items
        // 3. Group by foodId, Count
        // 4. Sort by count desc
        if (cityRegex) { // Trending nearby strictly requires a City, State is too broad usually
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

            promises.trending = Order.aggregate([
                {
                    $match: {
                        createdAt: { $gte: twoDaysAgo },
                        "deliveryAddress.city": cityRegex,
                        orderStatus: "delivered" // Only count completed orders
                    }
                },
                { $unwind: "$items" },
                {
                    $group: {
                        _id: "$items.foodId",
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 8 },
                {
                    $lookup: {
                        from: "foods",
                        localField: "_id",
                        foreignField: "_id",
                        as: "food"
                    }
                },
                { $unwind: "$food" },
                // We need to look up vendor to ensure it's still active/valid
                {
                    $lookup: {
                        from: "vendors",
                        localField: "food.vendor",
                        foreignField: "_id",
                        as: "vendor"
                    }
                },
                { $unwind: "$vendor" },
                {
                    $project: {
                        name: "$food.name",
                        slug: "$food.slug",
                        price: "$food.price",
                        images: "$food.images",
                        rating: "$food.rating",
                        ratingCount: "$food.ratingCount",
                        vendor: {
                            storeName: "$vendor.storeName",
                            logo: "$vendor.logo",
                            address: "$vendor.address"
                        }
                    }
                }
            ]);
        } else {
            promises.trending = Promise.resolve([]);
        }


        // --- E. Budget Friendly ---
        // Simple logic: In this location, what is "cheap"?
        // Let's say under 2000 for now, or we could support a query param.
        // Better: Sort by price asc.
        const budgetQuery = {
            available: true,
            price: { $lte: 2500 } // Hardcoded threshold for "Budget"
        };
        if (locationVendorIds.length > 0) {
            budgetQuery.vendor = { $in: locationVendorIds };
        }
        promises.budgetFriendly = Food.find(budgetQuery)
            .select("name slug price images vendor")
            .populate("vendor", "storeName logo address")
            .sort({ price: 1 }) // Cheapest first
            .limit(8)
            .lean();


        // EXECUTE ALL
        const [
            timeOfDay,
            underrated,
            weatherBased,
            trendingNearby,
            budgetFriendly
        ] = await Promise.all([
            promises.timeOfDay,
            promises.underrated,
            promises.weatherBased,
            promises.trending,
            promises.budgetFriendly
        ]);

        // Construct Response
        return res.status(200).json({
            success: true,
            meta: {
                timeOfDayLabel: timeContext.label,
                weatherCondition: weather || null,
                location: { city, state }
            },
            data: {
                timeOfDay,
                underrated,
                weatherBased,
                trendingNearby,
                budgetFriendly
            }
        });

    } catch (error) {
        console.error("Recommendations Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to generate recommendations."
            // Intentionally not exposing raw error stack
        });
    }
};
