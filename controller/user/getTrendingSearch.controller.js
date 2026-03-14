import MenuItem from "../../model/menu/MenuItem.js";
import MenuItemPortion from "../../model/menu/MenuItemPortion.js";
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
        const defaultAddress = user.addresses.find((a) => a.isDefault) || user.addresses[0];
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
        message: `No vendors found in ${userCity || ""} ${userState || ""}`.trim(),
      });
    }

    const vendorIds = vendors.map((v) => v._id);

    // Trending logic: High rating + High rating count + Available
    // Sorting by ratingCount and rating to find "popular" items
    const trendingItems = await MenuItem.find({
      is_available: true,
      is_in_stock: true,
      is_archived: false,
      ...(vendorIds.length > 0 ? { vendor_id: { $in: vendorIds } } : {}),
    })
      .select(
        "_id name image_url item_type dietary_type " + 
        "rating ratingCount vendor_id prep_time_minutes"
      )
      .sort({ ratingCount: -1, rating: -1 })
      .limit(10)
      .lean();

    if (!trendingItems.length) {
      return res.json({
        success: true,
        count: 0,
        trending: [],
        location: { city: userCity, state: userState }
      });
    }

    const trendingItemIds = trendingItems.map((i) => i._id);
    const trendingVendorIds = [...new Set(trendingItems.map((i) => i.vendor_id?.toString()).filter(Boolean))];

    // Bulk fetch vendors and portions for trending items
    const [trendingVendors, trendingPortions] = await Promise.all([
      Vendor.find({ _id: { $in: trendingVendorIds } }, "storeName logo address openingHours").lean(),
      MenuItemPortion.find({ menu_item_id: { $in: trendingItemIds } })
        .sort({ price: 1 })
        .lean(),
    ]);

    const trendingVendorMap = {};
    trendingVendors.forEach((v) => {
      trendingVendorMap[v._id.toString()] = v;
    });

    const trendingPriceMap = {};
    trendingPortions.forEach((p) => {
      const key = p.menu_item_id.toString();
      if (!trendingPriceMap[key]) trendingPriceMap[key] = p;
    });

    const formattedFoods = trendingItems.map((item) => {
      const key = item._id.toString();
      const vendor = trendingVendorMap[item.vendor_id?.toString()] || {};
      const cheapest = trendingPriceMap[key];

      return {
        _id: item._id,
        name: item.name,
        image: item.image_url || "",
        price: cheapest ? cheapest.price / 100 : null,
        portionLabel: cheapest?.label ?? null,
        item_type: item.item_type,
        dietary_type: item.dietary_type,
        rating: item.rating,
        ratingCount: item.ratingCount,
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
      location: { city: userCity, state: userState },
    });
  } catch (error) {
    console.error("GetTrendingSearch Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

