import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import MenuItem from "../model/menu/MenuItem.js";
import MenuItemPortion from "../model/menu/MenuItemPortion.js";
import { MenuItemChoiceGroup } from "../model/menu/MenuItemChoice.js";
import ComboItem from "../model/menu/ComboItem.js";
import Vendor from "../model/vendor/vendor.model.js";
import City from "../model/location/City.js";
import Category from "../model/category.model.js";
import { foodsByLocationRepository } from "../services/postgres/foodsByLocation.repository.js";

const normalizeValue = (value) => {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return "date";
  if (value?._bsontype === "ObjectId") return "id";
  if (typeof value === "object" && typeof value.toString === "function" && value.constructor?.name === "ObjectId") return "id";
  return value;
};

const signature = (value) => {
  const normalized = normalizeValue(value);
  if (normalized === null) return "null";
  if (normalized === undefined) return "undefined";
  if (Array.isArray(normalized)) {
    return {
      type: "array",
      length: normalized.length,
      sample: normalized.length ? signature(normalized[0]) : null,
    };
  }
  if (typeof normalized !== "object") return typeof normalized;

  return Object.fromEntries(
    Object.keys(normalized)
      .sort()
      .map((key) => [key, signature(normalized[key])])
  );
};

const diffSignatures = (left, right, path = "$", diffs = []) => {
  if (typeof left !== typeof right) {
    diffs.push(`${path}: type ${typeof left} !== ${typeof right}`);
    return diffs;
  }

  if (!left || !right || typeof left !== "object") {
    if (left !== right) diffs.push(`${path}: ${left} !== ${right}`);
    return diffs;
  }

  if (left.type === "array" || right.type === "array") {
    if (left.type !== right.type) {
      diffs.push(`${path}: array mismatch`);
      return diffs;
    }
    if (left.length !== right.length) diffs.push(`${path}.length: ${left.length} !== ${right.length}`);
    return diffSignatures(left.sample, right.sample, `${path}[]`, diffs);
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  for (const key of leftKeys.filter((key) => !rightKeys.includes(key))) {
    diffs.push(`${path}.${key}: missing in postgres`);
  }
  for (const key of rightKeys.filter((key) => !leftKeys.includes(key))) {
    diffs.push(`${path}.${key}: extra in postgres`);
  }
  for (const key of leftKeys.filter((key) => rightKeys.includes(key))) {
    diffSignatures(left[key], right[key], `${path}.${key}`, diffs);
  }
  return diffs;
};

const categoryShape = (category) =>
  category
    ? {
        id: category._id,
        name: category.name,
        slug: category.slug,
        parent: category.parent
          ? {
              id: category.parent._id,
              name: category.parent.name,
              slug: category.parent.slug,
            }
          : null,
      }
    : null;

const mongoFoodsByLocation = async ({ city, state, cityId, stateId }) => {
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
    const StateModel = (await import("../model/location/State.js")).default;
    const CityModel = (await import("../model/location/City.js")).default;
    const stateDoc = await StateModel.findOne({ name: stateRegex, isActive: true });
    const cityDoc = stateDoc ? await CityModel.findOne({ name: cityRegex, stateId: stateDoc._id, isActive: true }) : null;

    vendorQuery.$or = [{ "address.city": cityRegex, "address.state": stateRegex }];
    if (stateDoc && cityDoc) vendorQuery.$or.push({ stateId: stateDoc._id, cityId: cityDoc._id });
  }

  const vendors = await Vendor.find(vendorQuery)
    .select("_id storeName logo address openingHours platformDeliveryFeeOverride")
    .lean();

  if (!vendors.length) {
    return {
      success: true,
      location: { city, state, cityId, stateId },
      count: 0,
      foods: [],
      message: "No vendors found in this location.",
    };
  }

  const vendorIds = vendors.map((vendor) => vendor._id);
  const cityNames = [...new Set(vendors.map((vendor) => vendor.address?.city).filter(Boolean))];
  const cities = await City.find({ name: { $in: cityNames.map((name) => new RegExp(`^${name}$`, "i")) } }).lean();
  const cityFeeMap = {};
  cities.forEach((cityRecord) => {
    cityFeeMap[cityRecord.name.toLowerCase()] = cityRecord.platformDeliveryFee || 0;
  });

  const vendorMap = {};
  vendors.forEach((vendor) => {
    const cityName = vendor.address?.city?.toLowerCase();
    const resolvedDeliveryFee =
      vendor.platformDeliveryFeeOverride != null && vendor.platformDeliveryFeeOverride > 0
        ? vendor.platformDeliveryFeeOverride
        : cityFeeMap[cityName] || 0;
    vendorMap[vendor._id.toString()] = { ...vendor, resolvedDeliveryFee };
  });

  const [items, comboItems] = await Promise.all([
    MenuItem.find({
      vendor_id: { $in: vendorIds },
      is_available: true,
      is_in_stock: true,
      is_archived: false,
    })
      .select("_id name image_url item_type dietary_type description tags prep_time_minutes vendor_id platform_category_id")
      .lean(),
    ComboItem.find({
      vendor_id: { $in: vendorIds },
      is_available: true,
      is_in_stock: true,
      is_archived: false,
    }).lean(),
  ]);

  if (!items.length && !comboItems.length) {
    return {
      success: true,
      location: { city, state, cityId, stateId },
      count: 0,
      foods: [],
      message: "No foods available in this location right now.",
    };
  }

  const itemIds = items.map((item) => item._id);
  const platformCategoryIds = [
    ...new Set([...items.map((item) => item.platform_category_id?.toString()), ...comboItems.map((combo) => combo.platform_category_id?.toString())].filter(Boolean)),
  ];

  const [allPortions, allChoiceGroups, allCategories] = await Promise.all([
    MenuItemPortion.find({ menu_item_id: { $in: itemIds }, is_available: true }).sort({ price: 1 }).lean(),
    MenuItemChoiceGroup.find({ menu_item_id: { $in: itemIds } }).sort({ sort_order: 1 }).lean(),
    Category.find({ _id: { $in: platformCategoryIds } }).populate("parent").lean(),
  ]);

  const portionsMap = {};
  const cheapestMap = {};
  allPortions.forEach((portion) => {
    const key = portion.menu_item_id.toString();
    if (!portionsMap[key]) portionsMap[key] = [];
    portionsMap[key].push(portion);
    if (!cheapestMap[key]) cheapestMap[key] = portion;
  });

  const choiceGroupsMap = {};
  allChoiceGroups.forEach((group) => {
    const key = group.menu_item_id.toString();
    if (!choiceGroupsMap[key]) choiceGroupsMap[key] = [];
    choiceGroupsMap[key].push(group);
  });

  const categoryMap = {};
  allCategories.forEach((category) => {
    categoryMap[category._id.toString()] = category;
  });

  const formattedFoods = items.map((item) => {
    const key = item._id.toString();
    const vendor = vendorMap[item.vendor_id?.toString()] || {};
    const cheapest = cheapestMap[key];
    const platformCategory = categoryMap[item.platform_category_id?.toString()];

    return {
      _id: item._id,
      name: item.name,
      image: item.image_url || "",
      price: cheapest ? cheapest.price / 100 : null,
      portionLabel: cheapest?.label || null,
      description: item.description || "",
      deliveryFee: vendor.resolvedDeliveryFee || 0,
      item_type: item.item_type,
      dietary_type: item.dietary_type,
      tags: item.tags || [],
      prep_time_minutes: item.prep_time_minutes || null,
      platform_category: categoryShape(platformCategory),
      portions: (portionsMap[key] || []).map((portion) => ({
        _id: portion._id,
        label: portion.label,
        price_naira: portion.price / 100,
        is_default: portion.is_default,
        max_quantity: portion.max_quantity || null,
      })),
      choiceGroups: choiceGroupsMap[key] || [],
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

  const formattedCombos = comboItems.map((combo) => {
    const vendor = vendorMap[combo.vendor_id?.toString()] || {};
    const platformCategory = categoryMap[combo.platform_category_id?.toString()];

    return {
      _id: combo._id,
      name: combo.name,
      image: combo.image_url || "",
      price: Math.round(combo.price / 100),
      portionLabel: "Combo",
      description: combo.description || "",
      deliveryFee: vendor.resolvedDeliveryFee || 0,
      item_type: "combo",
      dietary_type: combo.dietary_type || "mixed",
      tags: combo.tags || [],
      prep_time_minutes: combo.prep_time_minutes || null,
      platform_category: categoryShape(platformCategory),
      isCombo: true,
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

  const foods = [...formattedFoods, ...formattedCombos];
  return {
    success: true,
    location: { city, state, cityId, stateId },
    count: foods.length,
    foods,
  };
};

const sortFoods = (response) => ({
  ...response,
  foods: [...(response.foods || [])].sort((left, right) => String(left._id).localeCompare(String(right._id))),
});

const runCompare = (label, mongoResponse, postgresResponse) => {
  const normalizedMongo = sortFoods(mongoResponse);
  const normalizedPostgres = sortFoods(postgresResponse);
  const diffs = diffSignatures(signature(normalizedMongo), signature(normalizedPostgres));
  return {
    label,
    diffCount: diffs.length,
    diffs: diffs.slice(0, 80),
    counts: {
      mongo: normalizedMongo.count,
      postgres: normalizedPostgres.count,
    },
  };
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const vendor = await Vendor.findOne({ active: true, suspended: false, deletedAt: null }).lean();
    const city = vendor?.address?.city;
    const state = vendor?.address?.state;
    if (!city || !state) throw new Error("No active vendor with address city/state found for sample");

    const mongoResponse = await mongoFoodsByLocation({ city, state });
    const postgresResponse = await foodsByLocationRepository.listFoodsByLocation({ city, state });

    console.log(JSON.stringify({ sample: { city, state }, results: [runCompare("foods by location", mongoResponse, postgresResponse)] }, null, 2));
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error("Foods-by-location parity check failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
