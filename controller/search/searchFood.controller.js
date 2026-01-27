// controllers/foodSearch.controller.js
import SearchTrend from "../../model/search/analytics/searchTrend.model.js";
import User from "../../model/user.model.js";
import Food from "../../model/vendor/food.model.js";
import vendorModel from "../../model/vendor/vendor.model.js";

/**
 * 🧠 AUTOCOMPLETE
 * Suggest foods or vendors as user types
 */
export const autocompleteFoods = async (req, res) => {
  try {
    const { q, limit = 8 } = req.query;
    if (!q || q.trim().length < 2)
      return res.status(200).json({ success: true, suggestions: [] });

    // Match vendors by name
    const vendors = await vendorModel
      .find({ storeName: { $regex: q, $options: "i" } })
      .select("_id storeName")
      .limit(5);

    // Match foods
    const foods = await Food.find({
      $or: [
        { name: { $regex: q, $options: "i" } },
        { "variants.name": { $regex: q, $options: "i" } },
        { tags: { $regex: q, $options: "i" } },
        { vendor: { $in: vendors.map((v) => v._id) } },
      ],
    })
      .select("name slug categories price images vendor portions choiceGroups")
      .populate(
        "vendor",
        "storeName storeSlug storeDescription address.street address.city address.state fullAddress logo rating ratingCount"
      )
      .limit(Number(limit));

    const suggestions = foods.map((f) => ({
      name: f.name,
      slug: f.slug,
      vendorName: f.vendor?.storeName || "Unknown Vendor",
      vendorLogo: f.vendor?.logo || null,
      vendorAddress: f.vendor
        ? `${f.vendor.address?.street || ""}, ${f.vendor.address?.city || ""}, ${f.vendor.address?.state || ""}`
        : "",
      categories: f.categories,
      image: f.images?.[0]?.url || null,
      price: f.price,
      portions: f.portions || [],
      choiceGroups: f.choiceGroups || [],
    }));

    res.status(200).json({
      success: true,
      count: suggestions.length,
      suggestions,
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
      category,
      minPrice,
      maxPrice,
      available,
      sort,
      page = 1,
      limit = 10,
      slug,
      state,
      city,
    } = req.query;

    const query = {};
    let vendors = [];

    // Get user's default address (or first address)
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

    // Slug search
    if (slug) query.slug = slug;

    // --- TEXT SEARCH & TRENDING ---
    if (q && q.trim() !== "") {
      // Track trending searches
      await SearchTrend.updateOne(
        { keyword: q.toLowerCase() },
        {
          $inc: { count: 1 },
          $set: {
            lastSearchedAt: new Date(),
            state: state?.toLowerCase() || userState?.toLowerCase() || undefined,
          },
        },
        { upsert: true }
      );

      // Match vendors by name/description
      const vendorMatches = await vendorModel.find({
        $or: [
          { storeName: { $regex: q, $options: "i" } },
          { storeSlug: { $regex: q, $options: "i" } },
          { storeDescription: { $regex: q, $options: "i" } },
        ],
      });
      vendors = vendorMatches;

      query.$or = [
        { $text: { $search: q } },
        { vendor: { $in: vendorMatches.map((v) => v._id) } },
      ];
    }

    // --- CITY / STATE FILTER ---
    const effectiveCity = city || userCity;
    const effectiveState = state || userState;

    if (effectiveCity || effectiveState) {
      const cityStateVendors = await vendorModel.find({
        ...(effectiveCity ? { "address.city": { $regex: effectiveCity, $options: "i" } } : {}),
        ...(effectiveState ? { "address.state": { $regex: effectiveState, $options: "i" } } : {}),
      }).select("_id");

      if (cityStateVendors.length > 0) {
        query.vendor = { $in: cityStateVendors.map((v) => v._id) };
      } else {
        return res.status(200).json({
          success: true,
          message: `No vendors found in ${effectiveCity || ""} ${effectiveState || ""}`.trim(),
          count: 0,
          data: [],
          vendors: [],
        });
      }
    }

    // --- CATEGORY, PRICE, AVAILABILITY ---
    if (category) query.categories = category;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    if (available !== undefined) query.available = available === "true";

    // --- SORTING ---
    let sortOption = {};
    switch (sort) {
      case "price_asc":
        sortOption.price = 1;
        break;
      case "price_desc":
        sortOption.price = -1;
        break;
      case "rating_desc":
        sortOption.rating = -1;
        break;
      case "newest":
        sortOption.createdAt = -1;
        break;
      default:
        sortOption = q ? { score: { $meta: "textScore" } } : { createdAt: -1 };
    }

    // --- PAGINATION ---
    const skip = (page - 1) * limit;

    const foods = await Food.find(query, q ? { score: { $meta: "textScore" } } : {})
      .populate({
        path: "vendor",
        select:
          "storeName storeSlug storeDescription address.street address.city address.state fullAddress logo rating ratingCount",
      })
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit));

    const total = await Food.countDocuments(query);

    res.status(200).json({
      success: true,
      city: userCity || "Unknown",
      state: userState || "Unknown",
      count: foods.length,
      total,
      currentPage: Number(page),
      totalPages: Math.ceil(total / limit),
      data: foods,
      vendors,
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

    // Filter: 
    // 1. Keyword must exist
    // 2. Keyword must be at least 3 characters (filter out "r", "ri", etc.)
    const filter = {
      keyword: { $exists: true, $regex: /^.{3,}$/ }
    };

    if (state) filter.state = state.toLowerCase();

    const trending = await SearchTrend.find(filter)
      .sort({ count: -1 })
      .limit(Number(limit))
      .lean();

    // Format for a clean frontend response
    const cleanTrending = trending.map(t => ({
      _id: t._id,
      keyword: t.keyword,
      count: t.count,
      lastSearchedAt: t.lastSearchedAt
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
