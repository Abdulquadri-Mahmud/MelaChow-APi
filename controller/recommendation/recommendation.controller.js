import MenuItem from "../../model/menu/MenuItem.js";
import ComboItem from "../../model/menu/ComboItem.js";
import MenuItemPortion from "../../model/menu/MenuItemPortion.js";
import Vendor from "../../model/vendor/vendor.model.js";
import Order from "../../model/order/Order.js";
import City from "../../model/location/City.js";

/**
 * 🛠 SHARED HELPERS
 */

/**
 * Bulk-resolves delivery fees for an array of vendor docs.
 * Returns a map: vendorId → resolvedFee (naira).
 */
const resolveDeliveryFees = async (vendors) => {
  const cityNames = [
    ...new Set(vendors.map(v => v.address?.city).filter(Boolean))
  ];

  const cities = await City.find({
    name: { $in: cityNames.map(c => new RegExp(`^${c}$`, "i")) }
  }).lean();

  const cityFeeMap = {};
  cities.forEach(c => {
    cityFeeMap[c.name.toLowerCase()] = c.platformDeliveryFee || 0;
  });

  const feeMap = {};
  vendors.forEach(v => {
    let fee = 0;
    if (v.deliveryManagedBy === "vendor") {
      fee = v.flatRateDeliveryFee || 0;
    } else if (v.platformDeliveryFeeOverride > 0) {
      fee = v.platformDeliveryFeeOverride;
    } else {
      const key = v.address?.city?.toLowerCase();
      fee = cityFeeMap[key] || 0;
    }
    feeMap[v._id.toString()] = fee;
  });

  return feeMap;
};

/**
 * Given an array of lean MenuItem docs, bulk-fetches vendors + cheapest portions 
 * and shapes each item into the standard response object.
 */
const buildRecommendationItems = async (items) => {
  if (!items.length) return [];

  const itemIds = items.map(i => i._id);
  const vendorIds = [
    ...new Set(items.map(i => i.vendor_id?.toString()).filter(Boolean))
  ];

  // Bulk fetch vendors + portions in parallel
  const [vendors, allPortions] = await Promise.all([
    Vendor.find(
      { _id: { $in: vendorIds } },
      "storeName logo address openingHours " +
      "deliveryManagedBy flatRateDeliveryFee " +
      "platformDeliveryFeeOverride"
    ).lean(),

    MenuItemPortion.find(
      { menu_item_id: { $in: itemIds }, is_available: true }
    ).sort({ price: 1 }).lean(),
  ]);

  // Resolve delivery fees for all vendors at once
  const feeMap = await resolveDeliveryFees(vendors);

  // Build vendorMap
  const vendorMap = {};
  vendors.forEach(v => {
    vendorMap[v._id.toString()] = v;
  });

  // Build cheapestMap — first entry per item is cheapest
  // because we sorted by price asc
  const cheapestMap = {};
  allPortions.forEach(p => {
    const key = p.menu_item_id.toString();
    if (!cheapestMap[key]) cheapestMap[key] = p;
  });

  return items.map(item => {
    const key      = item._id.toString();
    const vendor   = vendorMap[item.vendor_id?.toString()] || {};
    const cheapest = cheapestMap[key];

    return {
      _id:              item._id,
      name:             item.name,
      image:            item.image_url || "",
      price: item.item_type === "combo" ? item.price / 100 : (cheapest ? cheapest.price / 100 : null),
      portionLabel: item.item_type === "combo" ? "Combo" : (cheapest?.label || null),
      item_type:        item.item_type,
      dietary_type:     item.dietary_type || "mixed",
      tags:             item.tags || [],
      rating:           item.rating      || 0,
      ratingCount:      item.ratingCount || 0,
      deliveryFee:      feeMap[vendor._id?.toString()] ?? 0,
      restaurant: {
        _id:          vendor._id,
        storeName:    vendor.storeName,
        logo:         vendor.logo,
        city:         vendor.address?.city,
        state:        vendor.address?.state,
        openingHours: vendor.openingHours,
      },
    };
  });
};

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

        // Parallel fetch preparation
        const promises = {};

        // STEP 3 — LOCATION VENDOR RESOLUTION
        const vendorQuery = {
            active:    true,
            suspended: false,
            deletedAt: null,
        };
        if (cityRegex)  vendorQuery["address.city"]  = cityRegex;
        if (stateRegex) vendorQuery["address.state"] = stateRegex;

        const vendors = await Vendor.find(vendorQuery)
            .select("_id")
            .lean();
        
        const locationVendorIds = vendors.map(v => v._id);

        if (locationVendorIds.length === 0 && (cityRegex || stateRegex)) {
            // Location provided but no vendors? Return early with empty sections.
            return res.status(200).json({
                success: true,
                meta: {
                    timeOfDayLabel: getTimeOfDayContext().label,
                    weatherCondition: weather || null,
                    location: { city, state },
                },
                data: {
                    timeOfDay:      [],
                    underrated:     [],
                    weatherBased:   [],
                    trendingNearby: [],
                    budgetFriendly: [],
                }
            });
        }

        // --- A. Time-of-Day Recommendations ---
        const timeContext = getTimeOfDayContext();
        const timeQuery = {
            is_available: true, is_in_stock: true, is_archived: false,
            tags: { $in: timeContext.tags.map(t => new RegExp(t, "i")) },
            ...(locationVendorIds.length > 0 ? { vendor_id: { $in: locationVendorIds } } : {})
        };

        const [timeRawMenu, timeRawCombos] = await Promise.all([
            MenuItem.find(timeQuery).select("_id name image_url item_type dietary_type tags rating ratingCount vendor_id").sort({ ratingCount: -1 }).limit(6).lean(),
            ComboItem.find(timeQuery).select("_id name image_url dietary_type tags rating ratingCount vendor_id price").sort({ ratingCount: -1 }).limit(6).lean()
        ]);

        const timeMerged = [
            ...timeRawMenu,
            ...timeRawCombos.map(c => ({ ...c, item_type: "combo" }))
        ].sort((a, b) => (b.ratingCount || 0) - (a.ratingCount || 0)).slice(0, 6);

        promises.timeOfDay = buildRecommendationItems(timeMerged);


        // --- B. Underrated Vendors (Hidden Gems) ---
        const underratedQuery = {
            is_available: true, is_in_stock: true, is_archived: false,
            rating: { $gte: 4.0 }, ratingCount: { $lt: 50 },
            ...(locationVendorIds.length > 0 ? { vendor_id: { $in: locationVendorIds } } : {})
        };

        const [underratedMenu, underratedCombos] = await Promise.all([
            MenuItem.find(underratedQuery).select("_id name image_url item_type dietary_type tags rating ratingCount vendor_id").sort({ rating: -1 }).limit(6).lean(),
            ComboItem.find(underratedQuery).select("_id name image_url dietary_type tags rating ratingCount vendor_id price").sort({ rating: -1 }).limit(6).lean()
        ]);

        const underratedMerged = [
            ...underratedMenu,
            ...underratedCombos.map(c => ({ ...c, item_type: "combo" }))
        ].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6);

        promises.underrated = buildRecommendationItems(underratedMerged);


        // --- C. Weather-Based ---
        const weatherTags = getWeatherTags(weather);
        if (weatherTags.length > 0) {
            const weatherQuery = {
                is_available: true, is_in_stock: true, is_archived: false,
                tags: { $in: weatherTags.map(t => new RegExp(t, "i")) },
                ...(locationVendorIds.length > 0 ? { vendor_id: { $in: locationVendorIds } } : {})
            };

            const [weatherMenu, weatherCombos] = await Promise.all([
                MenuItem.find(weatherQuery).select("_id name image_url item_type dietary_type tags rating ratingCount vendor_id").limit(6).lean(),
                ComboItem.find(weatherQuery).select("_id name image_url dietary_type tags rating ratingCount vendor_id price").limit(6).lean()
            ]);

            const weatherMerged = [
                ...weatherMenu,
                ...weatherCombos.map(c => ({ ...c, item_type: "combo" }))
            ].slice(0, 6);

            promises.weatherBased = buildRecommendationItems(weatherMerged);
        } else {
            promises.weatherBased = Promise.resolve([]);
        }


        // --- D. Trending Nearby (Order Aggregation) ---
        if (cityRegex) {
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

            const trendingAgg = await Order.aggregate([
                {
                    $match: {
                        createdAt:              { $gte: twoDaysAgo },
                        "deliveryAddress.city": cityRegex,
                        orderStatus:            "delivered",
                    },
                },
                { $unwind: "$items" },
                {
                    $group: {
                        _id:   "$items.foodId",
                        count: { $sum: 1 },
                    },
                },
                { $sort: { count: -1 } },
                { $limit: 8 },
            ]);

            const trendingItemIds = trendingAgg
                .map(t => t._id)
                .filter(Boolean);

            if (trendingItemIds.length > 0) {
                const trendingRaw = await MenuItem.find({
                    _id:          { $in: trendingItemIds },
                    is_available: true,
                    is_in_stock:  true,
                    is_archived:  false,
                })
                .select(
                    "_id name image_url item_type dietary_type " +
                    "tags rating ratingCount vendor_id"
                )
                .lean();

                const orderMap = {};
                trendingAgg.forEach((t, i) => {
                    orderMap[t._id?.toString()] = i;
                });
                trendingRaw.sort((a, b) =>
                    (orderMap[a._id.toString()] ?? 99) -
                    (orderMap[b._id.toString()] ?? 99)
                );

                promises.trending = buildRecommendationItems(trendingRaw);
            } else {
                promises.trending = Promise.resolve([]);
            }
        } else {
            promises.trending = Promise.resolve([]);
        }


        // --- E. Budget Friendly ---
        // Pre-query MenuItemPortion for items with a cheapest portion ≤ ₦2500 (250000 kobo)
        const budgetPortions = await MenuItemPortion.find({
            price:        { $lte: 250000 },
            is_available: true,
        }).select("menu_item_id price").lean();

        if (budgetPortions.length > 0) {
            const budgetItemIdMap = {};
            budgetPortions.forEach(p => {
                const key = p.menu_item_id.toString();
                if (!budgetItemIdMap[key] || p.price < budgetItemIdMap[key].price) {
                    budgetItemIdMap[key] = p;
                }
            });

            const budgetItemIds = Object.keys(budgetItemIdMap);

            const budgetQuery = {
                _id: { $in: budgetItemIds },
                is_available: true, is_in_stock: true, is_archived: false,
                ...(locationVendorIds.length > 0 ? { vendor_id: { $in: locationVendorIds } } : {})
            };

            const [budgetMenu, budgetCombos] = await Promise.all([
                MenuItem.find(budgetQuery).select("_id name image_url item_type dietary_type tags rating ratingCount vendor_id").limit(20).lean(),
                ComboItem.find({
                    price: { $lte: 250000 },
                    is_available: true, is_in_stock: true, is_archived: false,
                    ...(locationVendorIds.length > 0 ? { vendor_id: { $in: locationVendorIds } } : {})
                }).select("_id name image_url dietary_type tags rating ratingCount vendor_id price").limit(20).lean()
            ]);

            const budgetMerged = [
                ...budgetMenu.map(m => ({ ...m, finalPrice: budgetItemIdMap[m._id.toString()]?.price ?? Infinity })),
                ...budgetCombos.map(c => ({ ...c, item_type: "combo", finalPrice: c.price }))
            ].sort((a, b) => a.finalPrice - b.finalPrice).slice(0, 8);

            promises.budgetFriendly = buildRecommendationItems(budgetMerged);
        } else {
            promises.budgetFriendly = Promise.resolve([]);
        }


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
                timeOfDayLabel:   timeContext.label,
                weatherCondition: weather || null,
                location:         { city, state },
            },
            data: {
                timeOfDay,
                underrated,
                weatherBased,
                trendingNearby,
                budgetFriendly,
            }
        });

    } catch (error) {
        console.error("Recommendations Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to generate recommendations."
        });
    }
};
