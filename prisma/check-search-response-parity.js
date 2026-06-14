import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import Category from "../model/category.model.js";
import MenuItem from "../model/menu/MenuItem.js";
import MenuItemPortion from "../model/menu/MenuItemPortion.js";
import ComboItem from "../model/menu/ComboItem.js";
import Vendor from "../model/vendor/vendor.model.js";
import City from "../model/location/City.js";
import { searchRepository } from "../services/postgres/search.repository.js";

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

const bulkFetchItemSupport = async (items) => {
  if (!items.length) {
    return { vendorMap: {}, priceMap: {}, portionsMap: {}, categoryMap: {} };
  }

  const itemIds = items.map((item) => item._id);
  const vendorIds = [...new Set(items.map((item) => item.vendor_id?.toString()).filter(Boolean))];
  const categoryIds = [...new Set(items.map((item) => item.platform_category_id?.toString()).filter(Boolean))];

  const [vendors, allPortions, categories] = await Promise.all([
    Vendor.find(
      { _id: { $in: vendorIds } },
      "storeName logo storeSlug address rating openingHours platformDeliveryFeeOverride hasActiveDeliveryPromo"
    ).lean(),
    MenuItemPortion.find({ menu_item_id: { $in: itemIds } }).sort({ price: 1 }).lean(),
    Category.find({ _id: { $in: categoryIds } }).populate("parent").lean(),
  ]);

  const cityNames = [...new Set(vendors.map((vendor) => vendor.address?.city).filter(Boolean))];
  const cities = await City.find({
    name: { $in: cityNames.map((city) => new RegExp(`^${city}$`, "i")) },
  }).lean();

  const cityFeeMap = {};
  cities.forEach((city) => {
    cityFeeMap[city.name.toLowerCase()] = city.platformDeliveryFee || 0;
  });

  const vendorMap = {};
  vendors.forEach((vendor) => {
    const cityName = vendor.address?.city?.toLowerCase();
    const resolvedDeliveryFee =
      vendor.platformDeliveryFeeOverride != null && vendor.platformDeliveryFeeOverride > 0
        ? vendor.platformDeliveryFeeOverride
        : cityFeeMap[cityName] || 0;

    vendorMap[vendor._id.toString()] = {
      ...vendor,
      resolvedDeliveryFee,
      hasActiveDeliveryPromo: false,
      activeDeliveryPromo: null,
    };
  });

  const priceMap = {};
  const portionsMap = {};
  allPortions.forEach((portion) => {
    const key = portion.menu_item_id.toString();
    if (!priceMap[key]) priceMap[key] = portion;
    if (!portionsMap[key]) portionsMap[key] = [];
    portionsMap[key].push(portion);
  });

  const categoryMap = {};
  categories.forEach((category) => {
    categoryMap[category._id.toString()] = category;
  });

  return { vendorMap, priceMap, portionsMap, categoryMap };
};

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
    is_available: item.is_available ?? true,
    is_in_stock: item.is_in_stock ?? true,
    rating: item.rating || 0,
    ratingCount: item.ratingCount || 0,
    tags: item.tags || [],
    portions: [],
    choiceGroups: item.choice_groups || [],
    platform_category: categoryShape(platformCategory),
    restaurant: {
      _id: vendor._id,
      storeName: vendor.storeName,
      logo: vendor.logo,
      storeSlug: vendor.storeSlug,
      city: vendor.address?.city,
      state: vendor.address?.state,
      rating: vendor.rating,
      openingHours: vendor.openingHours,
      hasActiveDeliveryPromo: vendor.hasActiveDeliveryPromo === true,
      activeDeliveryPromo: vendor.activeDeliveryPromo || null,
    },
  };
};

const mongoAutocomplete = async ({ q, limit = 8 }) => {
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

  const vendorNameMatches = await Vendor.find({
    storeName: { $regex: q, $options: "i" },
    active: true,
    suspended: false,
    deletedAt: null,
  })
    .select("_id")
    .lean();

  if (vendorNameMatches.length > 0) {
    matchQuery.$or.push({ vendor_id: { $in: vendorNameMatches.map((vendor) => vendor._id) } });
  }

  const [menus, combos] = await Promise.all([
    MenuItem.find(matchQuery)
      .select("_id name image_url item_type dietary_type is_available is_in_stock tags rating ratingCount vendor_id choice_groups platform_category_id")
      .sort({ ratingCount: -1, rating: -1 })
      .limit(Number(limit))
      .lean(),
    ComboItem.find(matchQuery)
      .select("_id name image_url is_available is_in_stock dietary_type tags rating ratingCount vendor_id choice_groups platform_category_id price")
      .sort({ ratingCount: -1, rating: -1 })
      .limit(Number(limit))
      .lean(),
  ]);

  const combined = [...menus, ...combos.map((combo) => ({ ...combo, item_type: "combo" }))]
    .sort((a, b) => (b.ratingCount || 0) - (a.ratingCount || 0))
    .slice(0, Number(limit));

  const { vendorMap, priceMap, portionsMap, categoryMap } = await bulkFetchItemSupport(combined);
  const suggestions = combined.map((item) => {
    const shaped = shapeSearchResult(item, vendorMap, priceMap, categoryMap);

    if (item.item_type === "combo") {
      shaped.price = item.price / 100;
      shaped.portionLabel = "Combo";
      shaped.portions = [];
    } else {
      shaped.portions = (portionsMap[item._id.toString()] || []).map((portion) => ({
        _id: portion._id,
        label: portion.label,
        price_naira: portion.price / 100,
        is_default: portion.is_default,
      }));
    }
    return shaped;
  });

  return {
    success: true,
    count: suggestions.length,
    suggestions,
    location: { city: null, state: null },
  };
};

const mongoSearch = async ({ q, category, available, sort, page = 1, limit = 10 }) => {
  const itemQuery = {
    is_available: true,
    is_in_stock: true,
    is_archived: false,
  };

  if (category) {
    const categoryDoc = await Category.findOne({
      name: { $regex: `^${category.trim()}$`, $options: "i" },
    })
      .select("_id")
      .lean();

    if (!categoryDoc) {
      return { success: true, count: 0, total: 0, data: [], vendors: [], city: "Unknown", state: "Unknown" };
    }
    itemQuery.platform_category_id = categoryDoc._id;
  }

  if (available === "false") delete itemQuery.is_available;

  let vendorMatches = [];
  if (q?.trim()) {
    vendorMatches = await Vendor.find({
      active: true,
      suspended: false,
      deletedAt: null,
      $or: [
        { storeName: { $regex: q, $options: "i" } },
        { storeSlug: { $regex: q, $options: "i" } },
        { storeDescription: { $regex: q, $options: "i" } },
      ],
    }).lean();

    itemQuery.$or = [
      { name: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
      { tags: { $regex: q, $options: "i" } },
      ...(vendorMatches.length > 0 ? [{ vendor_id: { $in: vendorMatches.map((vendor) => vendor._id) } }] : []),
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const sortOption = sort === "rating_desc" ? { ratingCount: -1, rating: -1 } : { createdAt: -1 };

  const [menus, combos, menusTotal, combosTotal] = await Promise.all([
    MenuItem.find(itemQuery)
      .select("_id name image_url item_type is_available is_in_stock dietary_type tags rating ratingCount vendor_id choice_groups platform_category_id prep_time_minutes")
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    ComboItem.find(itemQuery)
      .select("_id name image_url is_available is_in_stock dietary_type tags rating ratingCount vendor_id choice_groups platform_category_id price prep_time_minutes")
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    MenuItem.countDocuments(itemQuery),
    ComboItem.countDocuments(itemQuery),
  ]);

  const combined = [...menus, ...combos.map((combo) => ({ ...combo, item_type: "combo" }))].slice(0, Number(limit));
  const { vendorMap, priceMap, portionsMap, categoryMap } = await bulkFetchItemSupport(combined);
  const data = combined.map((item) => {
    const shaped = shapeSearchResult(item, vendorMap, priceMap, categoryMap);
    if (item.item_type === "combo") {
      shaped.price = item.price / 100;
      shaped.portionLabel = "Combo";
      shaped.portions = [];
    } else {
      shaped.portions = (portionsMap[item._id.toString()] || []).map((portion) => ({
        _id: portion._id,
        label: portion.label,
        price_naira: portion.price / 100,
        is_default: portion.is_default,
      }));
    }
    return shaped;
  });

  const total = menusTotal + combosTotal;

  return {
    success: true,
    city: "Unknown",
    state: "Unknown",
    count: data.length,
    total,
    currentPage: Number(page),
    totalPages: Math.ceil(total / Number(limit)),
    data,
    vendors: vendorMatches,
  };
};

const runCompare = (label, mongoResponse, postgresResponse) => {
  const diffs = diffSignatures(signature(mongoResponse), signature(postgresResponse));
  return {
    label,
    diffCount: diffs.length,
    diffs: diffs.slice(0, 80),
    counts: {
      mongo: mongoResponse.count ?? mongoResponse.data?.length ?? mongoResponse.suggestions?.length ?? null,
      postgres: postgresResponse.count ?? postgresResponse.data?.length ?? postgresResponse.suggestions?.length ?? null,
      mongoTotal: mongoResponse.total ?? null,
      postgresTotal: postgresResponse.total ?? null,
    },
  };
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const sampleItem = await MenuItem.findOne({ is_archived: false }).lean();
    const sampleCategory = sampleItem?.platform_category_id
      ? await Category.findById(sampleItem.platform_category_id).lean()
      : null;

    const samples = [
      {
        label: "search rice",
        mongo: () => mongoSearch({ q: "rice", page: 1, limit: 5 }),
        postgres: () => searchRepository.search({ q: "rice", page: 1, limit: 5 }),
      },
      {
        label: "search rating sort",
        mongo: () => mongoSearch({ q: "rice", sort: "rating_desc", page: 1, limit: 5 }),
        postgres: () => searchRepository.search({ q: "rice", sort: "rating_desc", page: 1, limit: 5 }),
      },
      {
        label: "autocomplete ri",
        mongo: () => mongoAutocomplete({ q: "ri", limit: 5 }),
        postgres: () => searchRepository.autocomplete({ q: "ri", limit: 5 }),
      },
      sampleCategory
        ? {
            label: "search category",
            mongo: () => mongoSearch({ category: sampleCategory.name, page: 1, limit: 5 }),
            postgres: () => searchRepository.search({ category: sampleCategory.name, page: 1, limit: 5 }),
          }
        : null,
    ];

    const results = [];
    for (const sample of samples.filter(Boolean)) {
      results.push(runCompare(sample.label, await sample.mongo(), await sample.postgres()));
    }

    console.log(JSON.stringify({ results }, null, 2));
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error("Search response parity check failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
