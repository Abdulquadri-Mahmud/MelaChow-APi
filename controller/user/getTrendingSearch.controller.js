import MenuItem from "../../model/menu/MenuItem.js";
import ComboItem from "../../model/menu/ComboItem.js";
import MenuItemPortion from "../../model/menu/MenuItemPortion.js";
import User from "../../model/user.model.js";
import Vendor from "../../model/vendor/vendor.model.js";
import City from "../../model/location/City.js";
import Category from "../../model/category.model.js";
import SearchTrend from "../../model/search/analytics/searchTrend.model.js";

/**
 * @desc    Get trending food searches/items
 * @route   GET /api/user/trending
 * @access  Public
 */
export const getTrendingSearch = async (req, res) => {
  try {
    // ── FIX 1: Resolve location from query params first,
    // then fall back to authenticated user's saved address ──
    const { city: queryCity, state: queryState } = req.query;

    let userCity  = queryCity?.trim()  || null;
    let userState = queryState?.trim() || null;

    if ((!userCity || !userState) && req.user?._id) {
      const user = await User.findById(req.user._id)
        .select("addresses")
        .lean();

      if (user?.addresses?.length > 0) {
        const addr = user.addresses.find((a) => a.isDefault) || user.addresses[0];
        userCity  = userCity  || addr.city?.trim()  || null;
        userState = userState || addr.state?.trim() || null;
      }
    }

    // ── Build vendor query with location filter ──
    const vendorQuery = {
      active: true,
      suspended: false,
      deletedAt: null,
    };

    if (userCity)  vendorQuery["address.city"]  = { $regex: userCity,  $options: "i" };
    if (userState) vendorQuery["address.state"] = { $regex: userState, $options: "i" };

    const vendors = await Vendor.find(vendorQuery).select("_id").lean();

    // Location was provided but no vendors found → early return
    if (vendors.length === 0 && (userCity || userState)) {
      return res.json({
        success:  true,
        count:    0,
        trending: [],
        location: { city: userCity, state: userState },
        meta:     { signal: "none" },
        message:  `No vendors found in ${userCity || ""} ${userState || ""}`.trim(),
      });
    }

    const vendorIds = vendors.map((v) => v._id);

    // ── FIX 2: Two-phase trending logic ──────────────────────────
    let trendingItems  = [];
    let hasSearchSignal = false;

    // ── PHASE 1: SearchTrend signal ─────────────────────────────
    const trendFilter = {
      keyword: { $exists: true, $regex: /^.{3,}$/ },
    };
    if (userState) {
      trendFilter.state = userState.toLowerCase();
    }

    const topKeywords = await SearchTrend.find(trendFilter)
      .sort({ count: -1 })
      .limit(10)
      .lean();

    hasSearchSignal = topKeywords.length > 0;

    if (hasSearchSignal) {
      const keywordRegexes = topKeywords.map((k) => new RegExp(k.keyword, "i"));

      const [matchedMenu, matchedCombos] = await Promise.all([
        MenuItem.find(trendQuery)
          .select("_id name image_url item_type dietary_type rating ratingCount vendor_id platform_category_id tags createdAt")
          .sort({ ratingCount: -1, rating: -1 })
          .limit(10)
          .lean(),
        ComboItem.find({
          is_available: true,
          is_in_stock: true,
          is_archived: false,
          $or: [
            { name: { $in: keywordRegexes } },
            { tags: { $in: keywordRegexes } },
          ],
          ...(vendorIds.length > 0 ? { vendor_id: { $in: vendorIds } } : {})
        })
          .select("_id name image_url dietary_type rating ratingCount vendor_id platform_category_id tags price createdAt")
          .sort({ ratingCount: -1, rating: -1 })
          .limit(10)
          .lean()
      ]);

      trendingItems = [
        ...matchedMenu,
        ...matchedCombos.map(c => ({ ...c, item_type: "combo" }))
      ].sort((a, b) => (b.ratingCount || 0) - (a.ratingCount || 0)).slice(0, 10);
    }

    // ── PHASE 2: Fallback — newest items ─────────────────────────
    // Triggered when: no SearchTrend data yet, or Phase 1 returned < 3 items.
    // Sort by createdAt (not ratingCount) — honest signal for a fresh market.
    if (trendingItems.length < 3) {
      const [fallbackMenu, fallbackCombos] = await Promise.all([
        MenuItem.find({
          ...fallbackQuery,
          ...(existingIds.length > 0 ? { _id: { $nin: existingIds } } : {})
        })
          .select("_id name image_url item_type dietary_type rating ratingCount vendor_id platform_category_id tags createdAt")
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
        ComboItem.find({
          ...fallbackQuery,
          ...(existingIds.length > 0 ? { _id: { $nin: existingIds } } : {})
        })
          .select("_id name image_url dietary_type rating ratingCount vendor_id platform_category_id tags price createdAt")
          .sort({ createdAt: -1 })
          .limit(10)
          .lean()
      ]);

      const additionalItems = [
        ...fallbackMenu,
        ...fallbackCombos.map(c => ({ ...c, item_type: "combo" }))
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      trendingItems = [...trendingItems, ...additionalItems].slice(0, 10);
    }

    // Nothing at all — respond gracefully
    if (!trendingItems.length) {
      return res.json({
        success:  true,
        count:    0,
        trending: [],
        location: { city: userCity, state: userState },
        meta:     { signal: "none" },
      });
    }

    // ── Bulk fetch support data ──────────────────────────────────
    const trendingItemIds    = trendingItems.map((i) => i._id);
    const trendingVendorIds  = [...new Set(trendingItems.map((i) => i.vendor_id?.toString()).filter(Boolean))];
    const trendingCategoryIds = [...new Set(trendingItems.map((i) => i.platform_category_id?.toString()).filter(Boolean))];

    const [trendingVendors, trendingPortions, trendingCategories] = await Promise.all([
      Vendor.find(
        { _id: { $in: trendingVendorIds } },
        "storeName logo address openingHours " +
        "deliveryManagedBy flatRateDeliveryFee platformDeliveryFeeOverride"
      ).lean(),
      MenuItemPortion.find({ menu_item_id: { $in: trendingItemIds } })
        .sort({ price: 1 })
        .lean(),
      Category.find({ _id: { $in: trendingCategoryIds } }).populate("parent").lean(),
    ]);

    // ── Category map ───────────────────────────────────────────
    const trendingCategoryMap = {};
    trendingCategories.forEach((cat) => {
      trendingCategoryMap[cat._id.toString()] = cat;
    });

    // ── Delivery fee resolution ────────────────────────────────
    const cityNames = [...new Set(trendingVendors.map((v) => v.address?.city).filter(Boolean))];
    const cities = await City.find({
      name: { $in: cityNames.map((c) => new RegExp(`^${c}$`, "i")) },
    }).lean();

    const cityFeeMap = {};
    cities.forEach((c) => {
      cityFeeMap[c.name.toLowerCase()] = c.platformDeliveryFee || 0;
    });

    const trendingVendorMap = {};
    trendingVendors.forEach((v) => {
      let resolvedFee = 0;
      if (v.deliveryManagedBy === "vendor") {
        resolvedFee = v.flatRateDeliveryFee || 0;
      } else if (v.platformDeliveryFeeOverride != null && v.platformDeliveryFeeOverride > 0) {
        resolvedFee = v.platformDeliveryFeeOverride;
      } else {
        const cityName = v.address?.city?.toLowerCase();
        resolvedFee = cityFeeMap[cityName] || 0;
      }

      trendingVendorMap[v._id.toString()] = { ...v, resolvedDeliveryFee: resolvedFee };
    });

    // ── Price map (cheapest portion) ───────────────────────────
    const trendingPriceMap = {};
    trendingPortions.forEach((p) => {
      const key = p.menu_item_id.toString();
      if (!trendingPriceMap[key]) trendingPriceMap[key] = p;
    });

    // ── Shape response ─────────────────────────────────────────
    const formattedFoods = trendingItems.map((item) => {
      const key             = item._id.toString();
      const vendor          = trendingVendorMap[item.vendor_id?.toString()] || {};
      const cheapest        = trendingPriceMap[key];
      const platformCategory = trendingCategoryMap[item.platform_category_id?.toString()];

      return {
        _id:          item._id,
        name:         item.name,
        image:        item.image_url || "",
        price: item.item_type === "combo" ? item.price / 100 : (cheapest ? cheapest.price / 100 : null),
        portionLabel: item.item_type === "combo" ? "Combo" : (cheapest?.label ?? null),
        deliveryFee:  vendor.resolvedDeliveryFee || 0,
        item_type:    item.item_type,
        dietary_type: item.dietary_type,
        rating:       item.rating,
        ratingCount:  item.ratingCount,
        platform_category: platformCategory
          ? {
              id:     platformCategory._id,
              name:   platformCategory.name,
              slug:   platformCategory.slug,
              parent: platformCategory.parent
                ? {
                    id:   platformCategory.parent._id,
                    name: platformCategory.parent.name,
                    slug: platformCategory.parent.slug,
                  }
                : null,
            }
          : null,
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

    // ── FIX 3: Include signal meta in response ─────────────────
    return res.json({
      success:  true,
      count:    formattedFoods.length,
      trending: formattedFoods,
      location: { city: userCity, state: userState },
      meta: {
        signal: hasSearchSignal ? "search_trends" : "newest",
        // "search_trends" = matched against SearchTrend keywords
        // "newest"        = fallback, no trend data yet for this location
      },
    });
  } catch (error) {
    console.error("GetTrendingSearch Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};
