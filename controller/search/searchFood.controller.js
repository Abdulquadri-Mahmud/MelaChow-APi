/*
 * DEFERRED POST-LAUNCH:
 *
 * 1. Price filtering (?minPrice, ?maxPrice) and price
 *    sorting (sort=price_asc, sort=price_desc):
 *    Requires aggregation pipeline joining MenuItem with
 *    MenuItemPortion. Dropped in MenuItem migration.
 *    Re-add using $lookup aggregation when ready.
 *
 * 2. Slug-based search (?slug=):
 *    MenuItem has no slug field. If needed, add a slug
 *    field to MenuItem and generate on item creation.
 *
 * 3. food.categories array filter:
 *    Replaced by platform_category_id (ObjectId ref).
 *    ?category= now accepts category name or ObjectId.
 */

import SearchTrend from "../../model/search/analytics/searchTrend.model.js";
import User from "../../model/user.model.js";
import MenuItem from "../../model/menu/MenuItem.js";
import ComboItem from "../../model/menu/ComboItem.js";
import MenuItemPortion from "../../model/menu/MenuItemPortion.js";
import Category from "../../model/category.model.js";
import vendorModel from "../../model/vendor/vendor.model.js";
import City from "../../model/location/City.js";

/**
 * Resolve vendorIds in the user's city.
 * Returns { vendorIds, userCity, userState }.
 * vendorIds is null if no location known (no filter).
 * vendorIds is [] if location known but no vendors found
 * (caller must short-circuit with empty result).
 */
const resolveLocationVendors = async (req, overrideCity, overrideState) => {
  let userCity = overrideCity || null;
  let userState = overrideState || null;

  // Pull from authenticated user's default address
  // if no explicit override was passed in query params
  if ((!userCity || !userState) && req.user?._id) {
    const user = await User.findById(req.user._id).select("addresses").lean();

    if (user?.addresses?.length > 0) {
      const addr = user.addresses.find((a) => a.isDefault) || user.addresses[0];
      userCity = userCity || addr.city?.trim() || null;
      userState = userState || addr.state?.trim() || null;
    }
  }

  // No location available at all — no vendor filter
  if (!userCity && !userState) {
    return { vendorIds: null, userCity: null, userState: null };
  }

  // Build vendor location query
  // City is the PRIMARY filter — state is supplementary.
  // This matches the getFoodsByLocation behaviour.
  const vendorLocationQuery = {
    active: true,
    suspended: false,
    deletedAt: null,
  };
  if (userCity) {
    vendorLocationQuery["address.city"] = {
      $regex: `^\\s*${userCity.trim()}\\s*$`,
      $options: "i",
    };
  }
  if (userState) {
    vendorLocationQuery["address.state"] = {
      $regex: userState.trim(),
      $options: "i",
    };
  }

  const vendors = await vendorModel.find(vendorLocationQuery).select("_id").lean();

  return {
    vendorIds: vendors.map((v) => v._id),
    userCity,
    userState,
  };
};

/**
 * Given an array of lean MenuItem docs, bulk-fetch
 * their vendors and cheapest portions.
 * Returns { vendorMap, priceMap, portionsMap }.
 * All maps keyed by ID string.
 * Zero loops with DB calls — always exactly 2 queries.
 */
const bulkFetchItemSupport = async (items) => {
  if (!items.length) {
    return { vendorMap: {}, priceMap: {}, portionsMap: {}, categoryMap: {} };
  }

  const itemIds = items.map((i) => i._id);
  const vendorIds = [...new Set(items.map((i) => i.vendor_id?.toString()).filter(Boolean))];
  const platformCategoryIds = [
    ...new Set(items.map((i) => i.platform_category_id?.toString()).filter(Boolean)),
  ];

  const [vendors, allPortions, allCategories] = await Promise.all([
    vendorModel
      .find(
        { _id: { $in: vendorIds } },
        "storeName logo storeSlug address rating openingHours " +
          "platformDeliveryFeeOverride"
      )
      .lean(),

    MenuItemPortion.find({ menu_item_id: { $in: itemIds } })
      .sort({ price_naira: 1 })
      .lean(),

    Category.find({ _id: { $in: platformCategoryIds } }).populate("parent").lean(),
  ]);

  // Bulk resolve delivery fees for all unique cities in these vendors
  const cityNames = [...new Set(vendors.map((v) => v.address?.city).filter(Boolean))];
  const cities = await City.find({
    name: { $in: cityNames.map((c) => new RegExp(`^${c}$`, "i")) },
  }).lean();

  const cityFeeMap = {};
  cities.forEach((c) => {
    cityFeeMap[c.name.toLowerCase()] = c.platformDeliveryFee || 0;
  });

    // Build vendorMap with resolved fees
    const vendorMap = {};
    vendors.forEach((v) => {
      let resolvedFee = 0;
      if (v.platformDeliveryFeeOverride != null && v.platformDeliveryFeeOverride > 0) {
        resolvedFee = v.platformDeliveryFeeOverride;
      } else {
        const cityName = v.address?.city?.toLowerCase();
        resolvedFee = cityFeeMap[cityName] || 0;
      }

    vendorMap[v._id.toString()] = {
      ...v,
      resolvedDeliveryFee: resolvedFee,
    };
  });

  // Build priceMap (cheapest) + portionsMap (all)
  const priceMap = {};
  const portionsMap = {};
  allPortions.forEach((p) => {
    const key = p.menu_item_id.toString();
    if (!priceMap[key]) priceMap[key] = p; // sorted asc → first = cheapest
    if (!portionsMap[key]) portionsMap[key] = [];
    portionsMap[key].push(p);
  });

  // Build categoryMap
  const categoryMap = {};
  allCategories.forEach((cat) => {
    categoryMap[cat._id.toString()] = cat;
  });

  return { vendorMap, priceMap, portionsMap, categoryMap };
};

/**
 * Shape a MenuItem + its cheapest portion + vendor
 * into the standard search result object.
 *
 * @param {Object} item       - lean MenuItem doc
 * @param {Object} vendorMap  - { vendorId: vendorDoc }
 * @param {Object} priceMap   - { itemId: cheapestPortion }
 */
const shapeSearchResult = (item, vendorMap, priceMap, categoryMap) => {
  const vendor = vendorMap[item.vendor_id?.toString()] || {};
  const cheapest = priceMap[item._id.toString()];
  const platformCategory = categoryMap[item.platform_category_id?.toString()];

  return {
    _id: item._id,
    name: item.name,
    image: item.image_url || "",
    price: cheapest ? cheapest.price / 100 : null,
    portionLabel: cheapest?.label ?? null,
    deliveryFee: vendor.resolvedDeliveryFee || 0,
    item_type: item.item_type,
    dietary_type: item.dietary_type,
    rating: item.rating || 0,
    ratingCount: item.ratingCount || 0,
    tags: item.tags || [],
    portions: [], // populated below if needed
    choiceGroups: item.choice_groups || [],
    platform_category: platformCategory
      ? {
          id: platformCategory._id,
          name: platformCategory.name,
          slug: platformCategory.slug,
          parent: platformCategory.parent
            ? {
                id: platformCategory.parent._id,
                name: platformCategory.parent.name,
                slug: platformCategory.parent.slug,
              }
            : null,
        }
      : null,
    restaurant: {
      _id: vendor._id,
      storeName: vendor.storeName,
      logo: vendor.logo,
      storeSlug: vendor.storeSlug,
      city: vendor.address?.city,
      state: vendor.address?.state,
      rating: vendor.rating,
      openingHours: vendor.openingHours,
    },
  };
};

/**
 * 🧠 AUTOCOMPLETE
 * Suggest foods or vendors as user types
 */
export const autocompleteFoods = async (req, res) => {
  try {
    const { q, limit = 8 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(200).json({ success: true, suggestions: [] });
    }

    // ── Location resolution ──────────────────────────
    const { vendorIds, userCity, userState } = await resolveLocationVendors(req, null, null);

    // Location known but zero vendors → empty result
    if (vendorIds !== null && vendorIds.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        suggestions: [],
        location: { city: userCity, state: userState },
        message: `No results found in ${userCity || ""} ${userState || ""}`.trim(),
      });
    }

    // ── Build Search query ──────────────────────────
    const matchQuery = {
      is_available: true,
      is_in_stock: true,
      is_archived: false,
      $or: [
        { name: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
        { tags: { $regex: q, $options: "i" } },
      ],
    };

    // Always apply location filter if we have vendor IDs
    if (vendorIds !== null) {
      matchQuery.vendor_id = { $in: vendorIds };
    }

    // Also match vendors by store name within location
    const vendorNameQuery = {
      storeName: { $regex: q, $options: "i" },
      active: true,
      suspended: false,
      deletedAt: null,
      ...(vendorIds !== null ? { _id: { $in: vendorIds } } : {}),
    };
    const vendorNameMatches = await vendorModel.find(vendorNameQuery).select("_id").lean();

    if (vendorNameMatches.length > 0) {
      // Include items from matching vendors in results
      matchQuery.$or.push({
        vendor_id: { $in: vendorNameMatches.map((v) => v._id) },
      });
    }

    // ── Fetch items (Menus + Combos) ─────────────────
    const [menus, combos] = await Promise.all([
      MenuItem.find(matchQuery)
        .select("_id name image_url item_type dietary_type tags rating ratingCount vendor_id choice_groups platform_category_id")
        .sort({ ratingCount: -1, rating: -1 })
        .limit(Number(limit))
        .lean(),
      ComboItem.find(matchQuery)
        .select("_id name image_url dietary_type tags rating ratingCount vendor_id choice_groups platform_category_id price")
        .sort({ ratingCount: -1, rating: -1 })
        .limit(Number(limit))
        .lean(),
    ]);

    // Merge and sort combined results
    const combined = [
      ...menus,
      ...combos.map(c => ({ ...c, item_type: "combo" }))
    ].sort((a, b) => (b.ratingCount || 0) - (a.ratingCount || 0))
     .slice(0, Number(limit));

    if (!combined.length) {
      return res.status(200).json({
        success: true,
        count: 0,
        suggestions: [],
        location: { city: userCity, state: userState },
      });
    }

    // ── Bulk fetch support data ──────────────────────
    const { vendorMap, priceMap, portionsMap, categoryMap } = await bulkFetchItemSupport(combined);

    // ── Shape response ───────────────────────────────
    const suggestions = combined.map((item) => {
      const shaped = shapeSearchResult(item, vendorMap, priceMap, categoryMap);
      
      if (item.item_type === "combo") {
          shaped.price = item.price / 100;
          shaped.portionLabel = "Combo";
          shaped.portions = [];
      } else {
          // Autocomplete includes all portions for cart use
          shaped.portions = (portionsMap[item._id.toString()] || []).map((p) => ({
            _id: p._id,
            label: p.label,
            price_naira: p.price / 100,
            is_default: p.is_default,
          }));
      }
      return shaped;
    });

    return res.status(200).json({
      success: true,
      count: suggestions.length,
      suggestions,
      location: { city: userCity, state: userState },
    });
  } catch (err) {
    console.error("Autocomplete Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch autocomplete suggestions",
      error: err.message,
    });
  }
};

/**
 * 🔍 MAIN FOOD SEARCH
 * Full-text, vendor, category, price, availability, city/state filtering.
 */
export const searchFoods = async (req, res) => {
  try {
    const {
      q,
      category, // now maps to platform_category_id
      available, // still supported
      sort,
      page = 1,
      limit = 10,
      state, // explicit override
      city, // explicit override
      // minPrice + maxPrice INTENTIONALLY DROPPED
      // will be re-added post-launch via aggregation
    } = req.query;

    // ── Location resolution ──────────────────────────
    // Explicit city/state query params take priority
    // over the user's saved address
    const { vendorIds, userCity, userState } = await resolveLocationVendors(req, city, state);

    // Location known but zero vendors → short-circuit
    if (vendorIds !== null && vendorIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: `No vendors found in ${userCity || ""} ${userState || ""}`.trim(),
        count: 0,
        total: 0,
        data: [],
        vendors: [],
        city: userCity || "Unknown",
        state: userState || "Unknown",
      });
    }

    // ── Base MenuItem query ──────────────────────────
    const itemQuery = {
      is_available: true,
      is_in_stock: true,
      is_archived: false,
    };

    // Always scope to user's city vendors
    if (vendorIds !== null) {
      itemQuery.vendor_id = { $in: vendorIds };
    }

    // ── Category filter ──────────────────────────────
    // ?category= accepts either:
    //   - a MongoDB ObjectId string (platform_category_id)
    //   - a category name string (we resolve to _id)
    if (category) {
      const mongoose = (await import("mongoose")).default;

      if (mongoose.isValidObjectId(category)) {
        // Direct ID match
        itemQuery.platform_category_id = category;
      } else {
        // Name match — find the category doc first
        const categoryDoc = await Category.findOne({
          name: { $regex: `^${category.trim()}$`, $options: "i" },
        })
          .select("_id")
          .lean();

        if (categoryDoc) {
          itemQuery.platform_category_id = categoryDoc._id;
        } else {
          // Category not found → return empty, don't crash
          return res.status(200).json({
            success: true,
            count: 0,
            total: 0,
            data: [],
            vendors: [],
            city: userCity || "Unknown",
            state: userState || "Unknown",
          });
        }
      }
    }

    // ── Availability override ────────────────────────
    // ?available=false allows showing unavailable items
    // in admin contexts. Default is always true above.
    if (available === "false") {
      delete itemQuery.is_available;
    }

    // ── Text search ──────────────────────────────────
    let vendorMatches = [];
    let useTextScore = false;

    if (q?.trim()) {
      // Track search trend
      await SearchTrend.updateOne(
        { keyword: q.toLowerCase().trim() },
        {
          $inc: { count: 1 },
          $set: {
            lastSearchedAt: new Date(),
            state: (state || userState)?.toLowerCase() || undefined,
            city: (city || userCity)?.toLowerCase() || undefined,
          },
        },
        { upsert: true }
      );

      // Find vendors matching the search term
      // within the already-resolved location
      const vendorTextQuery = {
        active: true,
        suspended: false,
        deletedAt: null,
        $or: [
          { storeName: { $regex: q, $options: "i" } },
          { storeSlug: { $regex: q, $options: "i" } },
          { storeDescription: { $regex: q, $options: "i" } },
        ],
        // Scope vendor name search to location vendors
        ...(vendorIds !== null ? { _id: { $in: vendorIds } } : {}),
      };

      vendorMatches = await vendorModel.find(vendorTextQuery).lean();

      // Combine text search with vendor name matches
      // while preserving any existing vendor_id filter
      const existingVendorFilter = itemQuery.vendor_id;

      itemQuery.$or = [
        { $text: { $search: q } },
        // Items from vendors whose name matched the query
        ...(vendorMatches.length > 0
          ? [{ vendor_id: { $in: vendorMatches.map((v) => v._id) } }]
          : []),
      ];

      // If we had a vendor location filter, it must still
      // apply — merge it with the $or using $and
      if (existingVendorFilter) {
        delete itemQuery.vendor_id;
        itemQuery.$and = [{ vendor_id: existingVendorFilter }, { $or: itemQuery.$or }];
        delete itemQuery.$or;
      }

      useTextScore = true;
    }

    // ── Sort ─────────────────────────────────────────
    // price_asc / price_desc DROPPED (no price on MenuItem)
    // Will re-add post-launch via aggregation pipeline
    let sortOption;
    switch (sort) {
      case "rating_desc":
        sortOption = { ratingCount: -1, rating: -1 };
        break;
      case "newest":
        sortOption = { createdAt: -1 };
        break;
      default:
        // Text search → rank by relevance score
        // No text search → newest first
        sortOption = useTextScore ? { score: { $meta: "textScore" } } : { createdAt: -1 };
    }

    // ── Pagination ───────────────────────────────────
    const skip = (Number(page) - 1) * Number(limit);

    // ── Execute queries ──────────────────────────────
    const projection = useTextScore ? { score: { $meta: "textScore" } } : {};

    const [menus, combos, menusTotal, combosTotal] = await Promise.all([
      MenuItem.find(itemQuery, projection)
        .select("_id name image_url item_type dietary_type tags rating ratingCount vendor_id choice_groups platform_category_id prep_time_minutes")
        .sort(sortOption)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      ComboItem.find(itemQuery, projection)
        .select("_id name image_url dietary_type tags rating ratingCount vendor_id choice_groups platform_category_id price prep_time_minutes")
        .sort(sortOption)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      MenuItem.countDocuments(itemQuery),
      ComboItem.countDocuments(itemQuery),
    ]);

    const total = menusTotal + combosTotal;
    // Merge and re-sort local page (imperfect pagination but consistent for UX)
    const combinedResults = [
        ...menus,
        ...combos.map(c => ({ ...c, item_type: "combo" }))
    ].sort((a, b) => {
        if (useTextScore) return (b.score || 0) - (a.score || 0);
        if (sort === "newest") return new Date(b.createdAt) - new Date(a.createdAt);
        if (sort === "rating_desc") return (b.ratingCount || 0) - (a.ratingCount || 0);
        return 0;
    }).slice(0, Number(limit));

    // ── Bulk fetch support data ──────────────────────
    const { vendorMap, priceMap, portionsMap, categoryMap } = await bulkFetchItemSupport(combinedResults);

    // ── Shape results ────────────────────────────────
    const data = combinedResults.map((item) => {
      const shaped = shapeSearchResult(item, vendorMap, priceMap, categoryMap);
      
      if (item.item_type === "combo") {
          shaped.price = item.price / 100;
          shaped.portionLabel = "Combo";
          shaped.portions = [];
      } else {
          shaped.portions = (portionsMap[item._id.toString()] || []).map((p) => ({
            _id: p._id,
            label: p.label,
            price_naira: p.price / 100, // standard price field
            is_default: p.is_default,
          }));
      }
      return shaped;
    });

    return res.status(200).json({
      success: true,
      city: userCity || "Unknown",
      state: userState || "Unknown",
      count: data.length,
      total,
      currentPage: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      data,
      vendors: vendorMatches,
    });
  } catch (err) {
    console.error("Search Error:", err);
    res.status(500).json({
      success: false,
      message: "Something went wrong with the search",
      error: err.message,
    });
  }
};

/**
 * 🔥 TRENDING SEARCHES
 */
export const getTrendingSearches = async (req, res) => {
  try {
    const { limit = 10, state } = req.query;

    const filter = {
      keyword: { $exists: true, $regex: /^.{3,}$/ },
    };

    if (state) filter.state = state.toLowerCase();

    const trending = await SearchTrend.find(filter).sort({ count: -1 }).limit(Number(limit)).lean();

    const cleanTrending = trending.map((t) => ({
      _id: t._id,
      keyword: t.keyword,
      count: t.count,
      lastSearchedAt: t.lastSearchedAt,
    }));

    res.status(200).json({
      success: true,
      count: cleanTrending.length,
      trending: cleanTrending,
    });
  } catch (err) {
    console.error("Trending Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch trending searches",
      error: err.message,
    });
  }
};

/**
 * 📊 ADMIN SEARCH ANALYTICS
 */
export const getSearchAnalytics = async (req, res) => {
  try {
    const { period = "month" } = req.query;
    const now = new Date();
    let since;

    switch (period) {
      case "day":
        since = new Date(now.setDate(now.getDate() - 1));
        break;
      case "week":
        since = new Date(now.setDate(now.getDate() - 7));
        break;
      case "month":
      default:
        since = new Date(now.setMonth(now.getMonth() - 1));
        break;
    }

    const totalKeywords = await SearchTrend.countDocuments();
    const topKeywords = await SearchTrend.find({ updatedAt: { $gte: since } })
      .sort({ count: -1 })
      .limit(10)
      .select("keyword count state lastSearchedAt");

    const stateStats = await SearchTrend.aggregate([
      { $match: { state: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: "$state",
          totalSearches: { $sum: "$count" },
          uniqueKeywords: { $sum: 1 },
        },
      },
      { $sort: { totalSearches: -1 } },
      { $limit: 10 },
    ]);

    const dailyTrend = await SearchTrend.aggregate([
      { $match: { updatedAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" } },
          totalSearches: { $sum: "$count" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      message: `Search analytics for the last ${period}`,
      summary: {
        totalKeywords,
        totalstates: stateStats.length,
      },
      topKeywords,
      stateStats,
      dailyTrend,
    });
  } catch (err) {
    console.error("Search Analytics Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch search analytics",
      error: err.message,
    });
  }
};
