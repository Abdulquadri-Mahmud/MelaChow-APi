import MenuItem from "../../model/menu/MenuItem.js";
import MenuItemPortion from "../../model/menu/MenuItemPortion.js";
import { MenuItemChoiceGroup } from "../../model/menu/MenuItemChoice.js";
import Vendor from "../../model/vendor/vendor.model.js";

/**
 * @desc    Get foods by location (City & State)
 * @route   GET /api/user/foods
 * @access  Public
 */
export const getFoodsByLocation = async (req, res) => {
  try {
    const { city, state, cityId, stateId } = req.query;

    // ── STEP 1: Validate ──────────────────────────────
    if ((!city || !state) && (!cityId || !stateId)) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide either city/state names " +
          "or cityId/stateId parameters.",
      });
    }

    // ── STEP 2: Build vendor query ────────────────────
    // Logic stays identical to original controller
    let vendorQuery = {
      active: true,
      suspended: false,
      deletedAt: null,
    };

    if (cityId && stateId) {
      vendorQuery.cityId = cityId;
      vendorQuery.stateId = stateId;
    } else {
      const cityRegex = new RegExp(`^\\s*${city.trim()}\\s*$`, "i");
      const stateRegex = new RegExp(`^\\s*${state.trim()}\\s*$`, "i");
      vendorQuery["address.city"] = cityRegex;
      vendorQuery["address.state"] = stateRegex;
    }

    // ── STEP 3: Find vendors in this location ─────────
    const vendors = await Vendor.find(vendorQuery).select(
      "_id storeName logo address openingHours"
    ).lean();

    if (!vendors.length) {
      return res.json({
        success: true,
        location: { city, state, cityId, stateId },
        count: 0,
        foods: [],
        message: "No vendors found in this location.",
      });
    }

    const vendorIds = vendors.map((v) => v._id);

    // Build a vendorMap for O(1) lookup below.
    const vendorMap = {};
    vendors.forEach((v) => {
      vendorMap[v._id.toString()] = v;
    });

    // ── STEP 4: Fetch available MenuItems ─────────────
    const items = await MenuItem.find({
      vendor_id: { $in: vendorIds },
      is_available: true,
      is_in_stock: true,
      is_archived: false,
    })
      .select(
        "_id name image_url item_type dietary_type " +
        "description tags prep_time_minutes " +
        "vendor_id"
      )
      .lean();

    if (!items.length) {
      return res.json({
        success: true,
        location: { city, state, cityId, stateId },
        count: 0,
        foods: [],
        message: "No foods available in this location right now.",
      });
    }

    const itemIds = items.map((i) => i._id);

    // ── STEP 5: Bulk fetch all portions & choice groups ──────
    const [allPortions, allChoiceGroups] = await Promise.all([
      MenuItemPortion.find({
        menu_item_id: { $in: itemIds },
        is_available: true,
      })
        .sort({ price: 1 }) // Sort by kobo price asc
        .lean(),
      MenuItemChoiceGroup.find({
        menu_item_id: { $in: itemIds },
      })
        .sort({ sort_order: 1 })
        .lean(),
    ]);

    // Grouping for O(1) matching
    const portionsMap = {};    // itemId -> all portions[]
    const cheapestMap = {};    // itemId -> cheapest portion
    const choiceGroupsMap = {}; // itemId -> choice groups[]

    allPortions.forEach((p) => {
      const key = p.menu_item_id.toString();
      if (!portionsMap[key]) portionsMap[key] = [];
      portionsMap[key].push(p);

      // First entry is cheapest due to sort
      if (!cheapestMap[key]) cheapestMap[key] = p;
    });

    allChoiceGroups.forEach((g) => {
      const key = g.menu_item_id.toString();
      if (!choiceGroupsMap[key]) choiceGroupsMap[key] = [];
      choiceGroupsMap[key].push(g);
    });

    // ── STEP 6: Shape response ────────────────────────
    const formattedFoods = items.map((item) => {
      const key = item._id.toString();
      const vendor = vendorMap[item.vendor_id?.toString()] || {};
      const cheapest = cheapestMap[key];
      const portions = portionsMap[key] || [];
      const choiceGroups = choiceGroupsMap[key] || [];

      return {
        _id: item._id,
        name: item.name,
        image: item.image_url || "",
        price: cheapest ? cheapest.price / 100 : null,
        portionLabel: cheapest?.label || null,
        description: item.description || "",
        item_type: item.item_type,
        dietary_type: item.dietary_type,
        tags: item.tags || [],
        prep_time_minutes: item.prep_time_minutes || null,
        portions: portions.map((p) => ({
          _id: p._id,
          label: p.label,
          price_naira: p.price / 100,
          is_default: p.is_default,
          max_quantity: p.max_quantity || null,
        })),
        choiceGroups: choiceGroups,
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
      location: { city, state, cityId, stateId },
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
