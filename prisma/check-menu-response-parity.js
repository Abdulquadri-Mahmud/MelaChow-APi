import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import Category from "../model/category.model.js";
import Vendor from "../model/vendor/vendor.model.js";
import MenuItem from "../model/menu/MenuItem.js";
import MenuItemPortion from "../model/menu/MenuItemPortion.js";
import { MenuItemChoiceGroup, MenuItemChoiceOption } from "../model/menu/MenuItemChoice.js";
import VendorMenuSection from "../model/menu/VendorMenuSection.js";
import ComboItem from "../model/menu/ComboItem.js";
import { menuCatalogRepository } from "../services/postgres/menuCatalog.repository.js";

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
        _id: category._id,
        name: category.name,
        parent: category.parent ? { _id: category.parent._id, name: category.parent.name } : null,
      }
    : null;

const publicVendorShape = (vendor, { includeDeliveryFee = false } = {}) => {
  if (!vendor) return null;

  const shaped = {
    _id: vendor._id,
    storeName: vendor.storeName,
    logo: vendor.logo,
    city: vendor.address?.city,
    state: vendor.address?.state,
    openingHours: vendor.openingHours,
    rating: vendor.rating ?? null,
    ratingCount: vendor.ratingCount ?? 0,
    storeSlug: vendor.storeSlug,
    isOpen: vendor.isOpen ?? true,
    estimatedDeliveryTime: vendor.estimatedDeliveryTime ?? 30,
    hasActiveDeliveryPromo: vendor.hasActiveDeliveryPromo || false,
    activeDeliveryPromo: vendor.activeDeliveryPromo || null,
  };

  if (includeDeliveryFee) {
    shaped.deliveryFee = vendor.deliveryFee || vendor.platformDeliveryFeeOverride || 0;
  }

  return shaped;
};

const mongoFullVendorMenu = async (vendorId) => {
  const vendor = await Vendor.findById(vendorId).lean();
  if (!vendor) return null;

  const [rawCombos, sections, items] = await Promise.all([
    ComboItem.find({
      vendor_id: vendor._id,
      is_available: { $ne: false },
      is_archived: { $ne: true },
    })
      .sort({ sort_order: 1, createdAt: -1 })
      .lean(),
    VendorMenuSection.find({
      vendor_id: vendor._id,
      deleted_at: null,
      is_visible: { $ne: false },
    })
      .sort("sort_order")
      .lean(),
    MenuItem.find({
      vendor_id: vendor._id,
      is_archived: { $ne: true },
      is_available: { $ne: false },
      category_deactivated: { $ne: true },
    })
      .sort({ sort_order: 1, createdAt: -1 })
      .lean(),
  ]);

  const itemIds = items.map((item) => item._id);
  const categoryIds = [
    ...new Set(
      [...items.map((item) => item.platform_category_id?.toString()), ...rawCombos.map((combo) => combo.platform_category_id?.toString())].filter(Boolean)
    ),
  ];

  const [allPortions, categories] = await Promise.all([
    MenuItemPortion.find({ menu_item_id: { $in: itemIds }, is_available: { $ne: false } }).lean(),
    Category.find({ _id: { $in: categoryIds } }).populate("parent", "name").lean(),
  ]);

  const portionsByItem = {};
  for (const portion of allPortions) {
    const key = portion.menu_item_id?.toString();
    if (!portionsByItem[key]) portionsByItem[key] = [];
    portionsByItem[key].push(portion);
  }

  const categoryMap = {};
  for (const category of categories) {
    categoryMap[category._id.toString()] = categoryShape(category);
  }

  const combos = rawCombos.map((combo) => ({
    _id: combo._id,
    name: combo.name,
    description: combo.description || null,
    image_url: combo.image_url || null,
    price_naira: Math.round((combo.price || 0) / 100),
    contents: combo.contents || [],
    dietary_type: combo.dietary_type || "mixed",
    tags: combo.tags || [],
    is_available: combo.is_available,
    platform_category: combo.platform_category_id ? categoryMap[combo.platform_category_id.toString()] : null,
    choice_groups: (combo.choice_groups || []).map((group) => ({
      _id: group._id,
      name: group.name,
      is_required: group.is_required,
      min_selections: group.min_selections,
      max_selections: group.max_selections,
      sort_order: group.sort_order || 0,
      options: (group.options || []).map((option) => ({
        _id: option._id,
        label: option.label,
        image_url: option.image_url || null,
        price_modifier_naira: Math.round((option.price_modifier || 0) / 100),
        is_available: option.is_available !== false,
      })),
    })),
  }));

  const enrichedItems = items.map((item) => {
    const portions = portionsByItem[item._id?.toString()] || [];
    const prices = portions.map((portion) => portion.price || 0);
    const defaultPortion = portions.find((portion) => portion.is_default) || portions[0];

    return {
      _id: item._id,
      name: item.name,
      description: item.description,
      image_url: item.image_url,
      item_type: item.item_type,
      dietary_type: item.dietary_type,
      is_available: item.is_available,
      is_in_stock: item.is_in_stock,
      prep_time_minutes: item.prep_time_minutes,
      tags: item.tags,
      vendor_section_id: item.vendor_section_id,
      platform_category: item.platform_category_id ? categoryMap[item.platform_category_id.toString()] : null,
      portions: {
        count: portions.length,
        default_price_naira: defaultPortion ? Math.round((defaultPortion.price || 0) / 100) : 0,
        min_price_naira: prices.length ? Math.round(Math.min(...prices) / 100) : 0,
        max_price_naira: prices.length ? Math.round(Math.max(...prices) / 100) : 0,
      },
    };
  });

  const sectionMap = {};
  for (const section of sections) sectionMap[section._id.toString()] = { ...section, items: [] };

  const unsectioned = [];
  for (const item of enrichedItems) {
    const sectionId = item.vendor_section_id?.toString();
    if (sectionId && sectionMap[sectionId]) sectionMap[sectionId].items.push(item);
    else unsectioned.push(item);
  }

  const populatedSections = sections.map((section) => sectionMap[section._id.toString()]).filter((section) => section.items.length > 0);
  if (unsectioned.length > 0) {
    populatedSections.push({
      _id: "unsectioned",
      name: "General",
      description: "Other items from our menu",
      items: unsectioned,
      is_virtual: true,
    });
  }
  if (combos.length > 0) {
    populatedSections.unshift({
      _id: "combos",
      name: "Combos & Deals",
      description: "Specially curated meal combinations",
      items: combos.map((combo) => ({ ...combo, item_type: "combo" })),
      is_virtual: true,
    });
  }

  return {
    success: true,
    vendor: {
      _id: vendor._id,
      storeName: vendor.storeName,
      logo: vendor.logo,
      coverImage: vendor.coverImage || null,
      description: vendor.storeDescription,
      cuisineTypes: vendor.cuisineTypes || [],
      address: vendor.address,
      isOpen: vendor.isOpen ?? true,
      openingHours: vendor.openingHours,
      acceptsDelivery: vendor.acceptsDelivery ?? true,
      deliveryFee: vendor.platformDeliveryFeeOverride ?? 0,
      estimatedDeliveryTime: vendor.estimatedDeliveryTime ?? 30,
      rating: vendor.rating ?? null,
      ratingCount: vendor.ratingCount ?? 0,
      storeSlug: vendor.storeSlug,
      hasActiveDeliveryPromo: false,
      activeDeliveryPromo: null,
    },
    combos,
    sections: populatedSections,
    unsectioned,
  };
};

const mongoFullItem = async (itemId) => {
  const item = await MenuItem.findOne({ _id: itemId, is_archived: false }).lean();
  if (!item) return null;

  const [portions, groups, category] = await Promise.all([
    MenuItemPortion.find({ menu_item_id: item._id, is_available: true }).sort("sort_order").lean(),
    MenuItemChoiceGroup.find({ menu_item_id: item._id }).sort("sort_order").lean(),
    Category.findById(item.platform_category_id).populate("parent", "id name slug").lean(),
  ]);
  const groupIds = groups.map((group) => group._id);
  const options = await MenuItemChoiceOption.find({ group_id: { $in: groupIds }, is_available: { $ne: false } }).sort("sort_order").lean();
  const optionsByGroup = {};
  for (const option of options) {
    const key = option.group_id.toString();
    if (!optionsByGroup[key]) optionsByGroup[key] = [];
    optionsByGroup[key].push({
      _id: option._id,
      label: option.label,
      image_url: option.image_url || null,
      price_modifier: option.price_modifier,
      price_modifier_naira: option.price_modifier / 100,
      is_available: option.is_available,
      sort_order: option.sort_order,
    });
  }

  return {
    ...item,
    dietary_type: item.dietary_type || "mixed",
    platform_category: category
      ? {
          id: category._id,
          name: category.name,
          slug: category.slug,
          parent: category.parent ? { id: category.parent._id, name: category.parent.name, slug: category.parent.slug } : null,
        }
      : null,
    portions: portions.map((portion) => ({
      ...portion,
      price_naira: (portion.price || 0) / 100,
    })),
    choice_groups: groups.map((group) => ({
      ...group,
      options: optionsByGroup[group._id.toString()] || [],
    })),
  };
};

const mongoComboDetails = async (comboId, vendor) => {
  const combo = await ComboItem.findOne({ _id: comboId, is_archived: false }).lean();
  if (!combo) return null;
  const vendorJson = publicVendorShape(vendor, { includeDeliveryFee: true });

  return {
    _id: combo._id,
    name: combo.name,
    description: combo.description || null,
    image_url: combo.image_url || null,
    price_naira: Math.round(combo.price / 100),
    contents: combo.contents || [],
    dietary_type: combo.dietary_type || "mixed",
    tags: combo.tags || [],
    is_available: combo.is_available,
    deliveryFee: vendorJson?.deliveryFee || 0,
    vendor: vendorJson,
    choice_groups: combo.choice_groups.map((group) => ({
      _id: group._id,
      name: group.name,
      is_required: group.is_required,
      min_selections: group.min_selections,
      max_selections: group.max_selections,
      options: group.options.map((option) => ({
        _id: option._id,
        label: option.label,
        image_url: option.image_url || null,
        price_modifier_naira: Math.round((option.price_modifier || 0) / 100),
        is_available: option.is_available !== false,
      })),
    })),
  };
};

const mongoItemsByCategory = async (categoryId, { page = 1, limit = 20 } = {}) => {
  const skip = (Number(page) - 1) * Number(limit);
  const where = {
    platform_category_id: categoryId,
    is_archived: false,
    is_available: true,
    is_in_stock: true,
    category_deactivated: false,
  };
  const [items, total] = await Promise.all([
    MenuItem.find(where).sort({ sort_order: 1, createdAt: -1 }).skip(skip).limit(Number(limit)).populate("vendor_id", "storeName logo address").lean(),
    MenuItem.countDocuments(where),
  ]);
  const fullItems = await Promise.all(
    items.map(async (item) => ({
      ...item,
      dietary_type: item.dietary_type || "mixed",
      portions: await MenuItemPortion.find({ menu_item_id: item._id, is_available: true }).sort("sort_order").lean(),
    }))
  );
  return {
    success: true,
    category_id: categoryId,
    items: fullItems,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
};

const mongoVendorSections = async (vendorId) => ({
  success: true,
  sections: await VendorMenuSection.find({ vendor_id: vendorId, deleted_at: null }).sort("sort_order").lean(),
});

const mongoVendorMenuItems = async (vendorId, { section, category, status, search, page = 1, limit = 50 } = {}) => {
  const filter = { vendor_id: vendorId };

  if (status === "active") {
    filter.is_archived = false;
  } else if (status === "archived") {
    filter.is_archived = true;
  }

  if (section) filter.vendor_section_id = section;
  if (category) filter.platform_category_id = category;
  if (search && search.trim()) filter.name = { $regex: search.trim(), $options: "i" };

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  const [items, total] = await Promise.all([
    MenuItem.find(filter)
      .sort({ is_archived: 1, sort_order: 1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .populate("platform_category_id", "name slug")
      .populate("vendor_section_id", "name")
      .lean(),
    MenuItem.countDocuments(filter),
  ]);

  if (items.length === 0) {
    return {
      success: true,
      items: [],
      pagination: {
        total: 0,
        page: pageNum,
        limit: limitNum,
        pages: 0,
        hasMore: false,
      },
    };
  }

  const itemIds = items.map((item) => item._id);
  const [portionCounts, choiceGroupCounts] = await Promise.all([
    MenuItemPortion.aggregate([
      { $match: { menu_item_id: { $in: itemIds } } },
      {
        $group: {
          _id: "$menu_item_id",
          count: { $sum: 1 },
          default_price: {
            $max: {
              $cond: [{ $eq: ["$is_default", true] }, "$price", null],
            },
          },
          min_price: { $min: "$price" },
          max_price: { $max: "$price" },
        },
      },
    ]),
    MenuItemChoiceGroup.aggregate([
      { $match: { menu_item_id: { $in: itemIds } } },
      { $group: { _id: "$menu_item_id", count: { $sum: 1 } } },
    ]),
  ]);

  const portionMap = {};
  const choiceGroupMap = {};

  portionCounts.forEach((portion) => {
    portionMap[portion._id.toString()] = {
      count: portion.count,
      default_price: portion.default_price,
      min_price: portion.min_price,
      max_price: portion.max_price,
    };
  });

  choiceGroupCounts.forEach((group) => {
    choiceGroupMap[group._id.toString()] = group.count;
  });

  const shaped = items.map((item) => {
    const idStr = item._id.toString();
    const portions = portionMap[idStr] || { count: 0, default_price: null, min_price: null, max_price: null };
    const choiceGroupCount = choiceGroupMap[idStr] || 0;

    return {
      _id: item._id,
      name: item.name,
      description: item.description,
      image_url: item.image_url,
      item_type: item.item_type,
      dietary_type: item.dietary_type,
      is_available: item.is_available,
      is_in_stock: item.is_in_stock,
      is_archived: item.is_archived,
      sort_order: item.sort_order,
      prep_time_minutes: item.prep_time_minutes,
      tags: item.tags,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      category: item.platform_category_id
        ? {
            _id: item.platform_category_id._id,
            name: item.platform_category_id.name,
            slug: item.platform_category_id.slug,
          }
        : null,
      section: item.vendor_section_id
        ? {
            _id: item.vendor_section_id._id,
            name: item.vendor_section_id.name,
          }
        : null,
      portions: {
        count: portions.count,
        default_price: portions.default_price,
        default_price_naira: portions.default_price ? portions.default_price / 100 : null,
        min_price_naira: portions.min_price ? portions.min_price / 100 : null,
        max_price_naira: portions.max_price ? portions.max_price / 100 : null,
      },
      choice_groups: {
        count: choiceGroupCount,
      },
      combos: [],
    };
  });

  const allItems = await MenuItem.find({ vendor_id: vendorId }).lean();
  const stats = {
    total: allItems.length,
    active: allItems.filter((item) => !item.is_archived && item.is_available).length,
    archived: allItems.filter((item) => item.is_archived).length,
    out_of_stock: allItems.filter((item) => !item.is_in_stock && !item.is_archived).length,
  };

  return {
    success: true,
    items: shaped,
    stats,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
      hasMore: pageNum * limitNum < total,
    },
  };
};

const mongoVendorCombos = async (vendorId, { is_available, is_archived, search, page = 1, limit = 10 } = {}) => {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const skip = (pageNum - 1) * limitNum;
  const query = {
    vendor_id: new mongoose.Types.ObjectId(vendorId),
    is_archived: is_archived === "true",
  };

  if (is_available !== undefined) {
    query.is_available = is_available === "true";
  }

  let combos;
  let total;
  if (search && search.trim()) {
    const searchQuery = { ...query, $text: { $search: search } };
    total = await ComboItem.countDocuments(searchQuery);
    combos = await ComboItem.find(searchQuery, { score: { $meta: "textScore" } })
      .sort({ score: { $meta: "textScore" }, sort_order: 1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();
  } else {
    total = await ComboItem.countDocuments(query);
    combos = await ComboItem.find(query).sort({ sort_order: 1, createdAt: -1 }).skip(skip).limit(limitNum).lean();
  }

  const result = (combos || []).map((combo) => ({
    ...combo,
    price_naira: (combo.price || 0) / 100,
    choice_groups: (combo.choice_groups || []).map((group) => ({
      ...group,
      options: (group.options || []).map((option) => ({
        ...option,
        price_modifier_naira: Math.round((option.price_modifier || 0) / 100),
      })),
    })),
  }));

  return {
    success: true,
    combos: result,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
      hasMore: skip + result.length < total,
    },
  };
};

const mongoVendorComboById = async (comboId) => {
  const combo = await ComboItem.findOne({ _id: new mongoose.Types.ObjectId(comboId) }).lean();
  if (!combo) return null;

  return {
    success: true,
    combo: {
      ...combo,
      price_naira: (combo.price || 0) / 100,
      choice_groups: (combo.choice_groups || []).map((group) => ({
        ...group,
        options: (group.options || []).map((option) => ({
          ...option,
          price_modifier_naira: Math.round((option.price_modifier || 0) / 100),
        })),
      })),
    },
  };
};

const runCompare = (label, mongoResponse, postgresResponse) => {
  const mongoSig = signature(mongoResponse);
  const postgresSig = signature(postgresResponse);
  const diffs = diffSignatures(mongoSig, postgresSig);
  return {
    label,
    diffCount: diffs.length,
    diffs: diffs.slice(0, 80),
  };
};

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  try {
    const vendor = await Vendor.findOne({}).lean();
    const item = await MenuItem.findOne({ vendor_id: vendor._id }).lean();
    const combo = await ComboItem.findOne({}).lean();
    const categoryId = item.platform_category_id.toString();
    const comboVendor = combo ? await Vendor.findById(combo.vendor_id).lean() : null;

    const postgresMenu = await menuCatalogRepository.getFullVendorMenu(vendor._id.toString());
    const postgresItem = await menuCatalogRepository.getMenuItemDetails(item._id.toString(), { vendorView: true });
    const postgresPublicFood = await menuCatalogRepository.getMenuItemDetails(item._id.toString());
    const postgresCombo = combo ? await menuCatalogRepository.getComboDetails(combo._id.toString()) : null;
    const postgresMarketplace = await menuCatalogRepository.listItemsByPlatformCategory(categoryId, { page: 1, limit: 20 });
    const postgresVendorIds = await menuCatalogRepository.listVendorIdsByPlatformCategory(categoryId);
    const postgresVendorSections = await menuCatalogRepository.listSectionsByVendor(vendor._id.toString());
    const postgresVendorMenuItems = await menuCatalogRepository.listVendorMenuItems(vendor._id.toString(), { page: 1, limit: 50 });
    const postgresVendorCombos = await menuCatalogRepository.listVendorCombos(vendor._id.toString(), { page: 1, limit: 10 });
    const postgresVendorCombo = combo ? await menuCatalogRepository.getComboById(combo._id.toString()) : null;

    const results = [
      runCompare("vendor menu", await mongoFullVendorMenu(vendor._id), { success: true, ...postgresMenu }),
      runCompare("vendor item detail", { success: true, item: { ...(await mongoFullItem(item._id)), vendor: null } }, { success: true, item: { ...postgresItem, vendor: null } }),
      runCompare("public food detail", { success: true, food: { ...(await mongoFullItem(item._id)), deliveryFee: 0, vendor: publicVendorShape(vendor) } }, { success: true, food: { ...postgresPublicFood, deliveryFee: postgresPublicFood?.vendor?.deliveryFee || 0, vendor: publicVendorShape(postgresPublicFood?.vendor) } }),
      combo ? runCompare("combo detail", { success: true, combo: await mongoComboDetails(combo._id, comboVendor) }, { success: true, combo: { ...postgresCombo, deliveryFee: postgresCombo?.vendor?.deliveryFee || 0, vendor: publicVendorShape(postgresCombo?.vendor, { includeDeliveryFee: true }) } }) : null,
      runCompare("marketplace category items", await mongoItemsByCategory(categoryId), {
        success: true,
        category_id: categoryId,
        items: postgresMarketplace.items,
        pagination: {
          page: 1,
          limit: 20,
          total: postgresMarketplace.total,
          totalPages: Math.ceil(postgresMarketplace.total / 20),
        },
      }),
      runCompare("marketplace category vendors", { success: true, category_id: categoryId, vendor_ids: await MenuItem.distinct("vendor_id", { platform_category_id: categoryId, is_archived: false, is_available: true, is_in_stock: true, category_deactivated: false }) }, { success: true, category_id: categoryId, vendor_ids: postgresVendorIds }),
      runCompare("vendor sections", await mongoVendorSections(vendor._id), { success: true, sections: postgresVendorSections }),
      runCompare("vendor menu items", await mongoVendorMenuItems(vendor._id, { page: 1, limit: 50 }), { success: true, ...postgresVendorMenuItems }),
      runCompare("vendor combos", await mongoVendorCombos(vendor._id, { page: 1, limit: 10 }), { success: true, ...postgresVendorCombos }),
      combo ? runCompare("vendor combo detail", await mongoVendorComboById(combo._id), { success: true, combo: postgresVendorCombo }) : null,
    ].filter(Boolean);

    console.log(JSON.stringify({ sample: { vendorId: vendor._id, itemId: item._id, comboId: combo?._id, categoryId }, results }, null, 2));
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  console.error("Menu response parity check failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
