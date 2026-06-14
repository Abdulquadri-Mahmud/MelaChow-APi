import "dotenv/config";
import mongoose from "mongoose";
import prisma from "../config/prisma.js";

import Category from "../model/category.model.js";
import State from "../model/location/State.js";
import City from "../model/location/City.js";
import Vendor from "../model/vendor/vendor.model.js";
import VendorMenuSection from "../model/menu/VendorMenuSection.js";
import MenuItem from "../model/menu/MenuItem.js";
import MenuItemPortion from "../model/menu/MenuItemPortion.js";
import { MenuItemChoiceGroup, MenuItemChoiceOption } from "../model/menu/MenuItemChoice.js";
import ComboItem from "../model/menu/ComboItem.js";

const stats = {
  states: 0,
  cities: 0,
  categories: 0,
  vendors: 0,
  sections: 0,
  menuItems: 0,
  portions: 0,
  choiceGroups: 0,
  choiceOptions: 0,
  combos: 0,
  skipped: [],
};

const toLegacyId = (value) => (value ? String(value) : null);
const nonEmpty = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

const asDate = (value) => (value ? new Date(value) : undefined);

const normalizeSlug = (value, fallback = "") =>
  String(value || fallback)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const cleanJson = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  return JSON.parse(JSON.stringify(value));
};

const mapDietaryType = (value) => {
  if (value === "non-veg") return "non_veg";
  return ["veg", "non_veg", "vegan", "halal", "kosher", "mixed"].includes(value) ? value : "mixed";
};

const mapItemType = (value) =>
  ["FOOD", "DRINK", "SIDE", "PROTEIN", "SWALLOW", "SOUP", "DESSERT", "OTHER", "combo"].includes(value)
    ? value
    : "FOOD";

const mapLocationStatus = (value) => (["approved", "pending_review"].includes(value) ? value : null);
const mapDeliveryManagedBy = (value) => (["vendor", "admin"].includes(value) ? value : "admin");

const parseArgs = () => {
  const args = new Set(process.argv.slice(2));
  return {
    dryRun: args.has("--dry-run"),
    limit: Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 0),
  };
};

const write = async (label, action, dryRun) => {
  if (dryRun) return null;
  try {
    return await action();
  } catch (error) {
    error.message = `${label}: ${error.message}`;
    throw error;
  }
};

const findCategoryBySlugParent = (slug, parentId) =>
  prisma.category.findFirst({
    where: {
      slug,
      parentId: parentId || null,
    },
    select: { id: true },
  });

const resolveCategoryId = async (mongoId) => {
  if (!mongoId) return null;
  const category = await prisma.category.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return category?.id || null;
};

const resolveStateId = async (mongoId) => {
  if (!mongoId) return null;
  const state = await prisma.state.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return state?.id || null;
};

const resolveCityId = async (mongoId) => {
  if (!mongoId) return null;
  const city = await prisma.city.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return city?.id || null;
};

const resolveVendorId = async (mongoId) => {
  if (!mongoId) return null;
  const vendor = await prisma.vendor.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return vendor?.id || null;
};

const resolveSectionId = async (mongoId) => {
  if (!mongoId) return null;
  const section = await prisma.vendorMenuSection.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return section?.id || null;
};

const resolveMenuItemId = async (mongoId) => {
  if (!mongoId) return null;
  const item = await prisma.menuItem.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return item?.id || null;
};

const resolveChoiceGroupId = async (mongoId) => {
  if (!mongoId) return null;
  const group = await prisma.menuItemChoiceGroup.findUnique({
    where: { legacyMongoId: toLegacyId(mongoId) },
    select: { id: true },
  });
  return group?.id || null;
};

const importStates = async (dryRun) => {
  const states = await State.find({}).lean();

  for (const state of states) {
    const legacyMongoId = toLegacyId(state._id);
    const existing = await prisma.state.findFirst({
      where: {
        OR: [{ legacyMongoId }, { name: state.name }],
      },
      select: { id: true },
    });

    const data = {
      legacyMongoId,
      name: state.name,
      isActive: state.isActive !== false,
      createdAt: asDate(state.createdAt),
      updatedAt: asDate(state.updatedAt),
    };

    await write(`state ${state.name}`, () =>
      existing
        ? prisma.state.update({ where: { id: existing.id }, data })
        : prisma.state.create({ data }), dryRun);
    stats.states += 1;
  }
};

const importCities = async (dryRun) => {
  const cities = await City.find({}).lean();

  for (const city of cities) {
    const stateId = await resolveStateId(city.stateId);
    if (!stateId) {
      stats.skipped.push(`city:${city._id}: missing state ${city.stateId}`);
      continue;
    }

    const legacyMongoId = toLegacyId(city._id);
    const existing = await prisma.city.findFirst({
      where: {
        OR: [
          { legacyMongoId },
          {
            name: city.name,
            stateId,
          },
        ],
      },
      select: { id: true },
    });

    const data = {
      legacyMongoId,
      name: city.name,
      stateId,
      isActive: city.isActive !== false,
      platformDeliveryFee: city.platformDeliveryFee || 0,
      createdAt: asDate(city.createdAt),
      updatedAt: asDate(city.updatedAt),
    };

    await write(`city ${city.name}`, () =>
      existing
        ? prisma.city.update({ where: { id: existing.id }, data })
        : prisma.city.create({ data }), dryRun);
    stats.cities += 1;
  }
};

const importCategories = async (dryRun) => {
  const categories = await Category.find({}).lean();
  const pending = new Map(categories.map((category) => [toLegacyId(category._id), category]));
  let progressed = true;

  while (pending.size && progressed) {
    progressed = false;

    for (const [legacyMongoId, category] of [...pending.entries()]) {
      const parentLegacyId = toLegacyId(category.parent);
      const parentId = parentLegacyId ? await resolveCategoryId(parentLegacyId) : null;

      if (parentLegacyId && !parentId) continue;

      const slug = normalizeSlug(category.slug, category.name);
      const existingByLegacy = await prisma.category.findUnique({
        where: { legacyMongoId },
        select: { id: true },
      });
      const existingBySlug = existingByLegacy || (await findCategoryBySlugParent(slug, parentId));
      const data = {
        legacyMongoId,
        name: category.name,
        slug,
        parentId,
        description: category.description || "",
        image: category.image || "",
        isActive: category.isActive !== false,
        createdAt: asDate(category.createdAt),
        updatedAt: asDate(category.updatedAt),
      };

      await write(`category ${category.name}`, () =>
        existingBySlug
          ? prisma.category.update({ where: { id: existingBySlug.id }, data })
          : prisma.category.create({ data }), dryRun);

      pending.delete(legacyMongoId);
      stats.categories += 1;
      progressed = true;
    }
  }

  for (const category of pending.values()) {
    stats.skipped.push(`category:${category._id}: missing parent ${category.parent}`);
  }
};

const vendorData = async (vendor) => {
  const legacyMongoId = toLegacyId(vendor._id);
  const stateId = await resolveStateId(vendor.stateId);
  const cityId = await resolveCityId(vendor.cityId);

  return {
    legacyMongoId,
    name: vendor.name || vendor.storeName || `Vendor ${legacyMongoId}`,
    email: vendor.email || `${legacyMongoId}@legacy.local`,
    phone: vendor.phone || legacyMongoId,
    password: vendor.password || null,
    resetPasswordToken: vendor.resetPasswordToken || null,
    resetPasswordExpires: asDate(vendor.resetPasswordExpires),
    loginAttempts: vendor.loginAttempts || 0,
    lockUntil: asDate(vendor.lockUntil),
    lastLogin: asDate(vendor.lastLogin),
    otp: vendor.otp || null,
    otpExpires: asDate(vendor.otpExpires),
    storeName: vendor.storeName || vendor.name || `Vendor ${legacyMongoId}`,
    storeSlug: nonEmpty(vendor.storeSlug),
    storeDescription: vendor.storeDescription || "",
    logo: vendor.logo || "",
    coverImage: vendor.coverImage || "",
    address: cleanJson(vendor.address, {}),
    stateId,
    cityId,
    locationStatus: mapLocationStatus(vendor.locationStatus),
    requestedState: vendor.requestedState || "",
    requestedCity: vendor.requestedCity || "",
    cuisineTypes: vendor.cuisineTypes || [],
    openingHours: cleanJson(vendor.openingHours, {}),
    walletId: null,
    payoutDetails: cleanJson(vendor.payoutDetails, null),
    totalSales: vendor.totalSales || 0,
    totalOrders: vendor.totalOrders || 0,
    commissionRate: vendor.commissionRate ?? 0.1,
    rating: vendor.rating || 0,
    ratingCount: vendor.ratingCount || 0,
    verified: vendor.verified || false,
    isApproved: vendor.isApproved || false,
    termsAcceptance: cleanJson(vendor.termsAcceptance, {}),
    suspended: vendor.suspended || false,
    active: vendor.active !== false,
    hasActiveDeliveryPromo: vendor.hasActiveDeliveryPromo || false,
    suspensionReason: vendor.suspensionReason || "",
    acceptsDelivery: vendor.acceptsDelivery !== false,
    flatRateDeliveryFee: vendor.flatRateDeliveryFee || 0,
    deliveryRadiusKm: vendor.deliveryRadiusKm ?? 5,
    tags: vendor.tags || [],
    metadata: cleanJson(vendor.metadata, {}),
    ownerIds: (vendor.owners || []).map(toLegacyId).filter(Boolean),
    deletedAt: asDate(vendor.deletedAt),
    adminNotes: vendor.adminNotes || "",
    deliveryManagedBy: mapDeliveryManagedBy(vendor.deliveryManagedBy),
    platformDeliveryFeeOverride: vendor.platformDeliveryFeeOverride ?? null,
    createdAt: asDate(vendor.createdAt),
    updatedAt: asDate(vendor.updatedAt),
  };
};

const importVendors = async (dryRun, limit) => {
  const query = Vendor.find({}).select("+password +resetPasswordToken +resetPasswordExpires +otp +otpExpires +payoutDetails").lean();
  if (limit) query.limit(limit);
  const vendors = await query;

  for (const vendor of vendors) {
    const data = await vendorData(vendor);
    await write(`vendor ${vendor._id}`, () =>
      prisma.vendor.upsert({
        where: { legacyMongoId: data.legacyMongoId },
        create: data,
        update: data,
      }), dryRun);
    stats.vendors += 1;
  }
};

const importSections = async (dryRun) => {
  const sections = await VendorMenuSection.find({}).lean();

  for (const section of sections) {
    const vendorId = await resolveVendorId(section.vendor_id);
    if (!vendorId) {
      stats.skipped.push(`section:${section._id}: missing vendor ${section.vendor_id}`);
      continue;
    }

    const data = {
      legacyMongoId: toLegacyId(section._id),
      vendorId,
      name: section.name,
      description: section.description || null,
      sortOrder: section.sort_order || 0,
      isVisible: section.is_visible !== false,
      deletedAt: asDate(section.deleted_at),
      createdAt: asDate(section.createdAt),
      updatedAt: asDate(section.updatedAt),
    };

    await write(`section ${section._id}`, () =>
      prisma.vendorMenuSection.upsert({
        where: { legacyMongoId: data.legacyMongoId },
        create: data,
        update: data,
      }), dryRun);
    stats.sections += 1;
  }
};

const importMenuItems = async (dryRun) => {
  const items = await MenuItem.find({}).lean();

  for (const item of items) {
    const vendorId = await resolveVendorId(item.vendor_id);
    const platformCategoryId = await resolveCategoryId(item.platform_category_id);
    const vendorSectionId = await resolveSectionId(item.vendor_section_id);

    if (!vendorId || !platformCategoryId) {
      stats.skipped.push(`menuItem:${item._id}: missing vendor/category`);
      continue;
    }

    const data = {
      legacyMongoId: toLegacyId(item._id),
      vendorId,
      platformCategoryId,
      vendorSectionId,
      name: item.name,
      description: item.description || null,
      imageUrl: item.image_url || null,
      itemType: mapItemType(item.item_type),
      dietaryType: mapDietaryType(item.dietary_type),
      isAvailable: item.is_available !== false,
      isInStock: item.is_in_stock !== false,
      isArchived: item.is_archived || false,
      categoryDeactivated: item.category_deactivated || false,
      sortOrder: item.sort_order || 0,
      prepTimeMinutes: item.prep_time_minutes ?? null,
      tags: item.tags || [],
      rating: item.rating || 0,
      ratingCount: item.ratingCount || 0,
      createdAt: asDate(item.createdAt),
      updatedAt: asDate(item.updatedAt),
    };

    await write(`menuItem ${item._id}`, () =>
      prisma.menuItem.upsert({
        where: { legacyMongoId: data.legacyMongoId },
        create: data,
        update: data,
      }), dryRun);
    stats.menuItems += 1;
  }
};

const importPortions = async (dryRun) => {
  const portions = await MenuItemPortion.find({}).lean();

  for (const portion of portions) {
    const menuItemId = await resolveMenuItemId(portion.menu_item_id);
    if (!menuItemId) {
      stats.skipped.push(`portion:${portion._id}: missing menu item ${portion.menu_item_id}`);
      continue;
    }

    const data = {
      legacyMongoId: toLegacyId(portion._id),
      menuItemId,
      label: portion.label,
      price: portion.price || 0,
      isDefault: portion.is_default || false,
      isAvailable: portion.is_available !== false,
      isInStock: portion.is_in_stock !== false,
      maxQuantity: portion.max_quantity ?? null,
      sortOrder: portion.sort_order || 0,
      createdAt: asDate(portion.createdAt),
      updatedAt: asDate(portion.updatedAt),
    };

    await write(`portion ${portion._id}`, () =>
      prisma.menuItemPortion.upsert({
        where: { legacyMongoId: data.legacyMongoId },
        create: data,
        update: data,
      }), dryRun);
    stats.portions += 1;
  }
};

const importChoiceGroups = async (dryRun) => {
  const groups = await MenuItemChoiceGroup.find({}).lean();

  for (const group of groups) {
    const menuItemId = await resolveMenuItemId(group.menu_item_id);
    if (!menuItemId) {
      stats.skipped.push(`choiceGroup:${group._id}: missing menu item ${group.menu_item_id}`);
      continue;
    }

    const data = {
      legacyMongoId: toLegacyId(group._id),
      menuItemId,
      name: group.name,
      minSelections: group.min_selections || 0,
      maxSelections: group.max_selections ?? 1,
      isRequired: group.is_required || false,
      sortOrder: group.sort_order || 0,
      createdAt: asDate(group.createdAt),
      updatedAt: asDate(group.updatedAt),
    };

    await write(`choiceGroup ${group._id}`, () =>
      prisma.menuItemChoiceGroup.upsert({
        where: { legacyMongoId: data.legacyMongoId },
        create: data,
        update: data,
      }), dryRun);
    stats.choiceGroups += 1;
  }
};

const importChoiceOptions = async (dryRun) => {
  const options = await MenuItemChoiceOption.find({}).lean();

  for (const option of options) {
    const groupId = await resolveChoiceGroupId(option.group_id);
    if (!groupId) {
      stats.skipped.push(`choiceOption:${option._id}: missing choice group ${option.group_id}`);
      continue;
    }

    const data = {
      legacyMongoId: toLegacyId(option._id),
      groupId,
      label: option.label,
      imageUrl: option.image_url || null,
      priceModifier: option.price_modifier || 0,
      isAvailable: option.is_available !== false,
      sortOrder: option.sort_order || 0,
      createdAt: asDate(option.createdAt),
      updatedAt: asDate(option.updatedAt),
    };

    await write(`choiceOption ${option._id}`, () =>
      prisma.menuItemChoiceOption.upsert({
        where: { legacyMongoId: data.legacyMongoId },
        create: data,
        update: data,
      }), dryRun);
    stats.choiceOptions += 1;
  }
};

const normalizeComboChoiceGroups = (groups = []) =>
  cleanJson(groups, []).map((group) => ({
    ...group,
    _id: toLegacyId(group._id),
    options: (group.options || []).map((option) => ({
      ...option,
      _id: toLegacyId(option._id),
    })),
  }));

const importCombos = async (dryRun) => {
  const combos = await ComboItem.find({}).lean();

  for (const combo of combos) {
    const vendorId = await resolveVendorId(combo.vendor_id);
    const platformCategoryId = await resolveCategoryId(combo.platform_category_id);
    const vendorSectionId = await resolveSectionId(combo.vendor_section_id);

    if (!vendorId || !platformCategoryId) {
      stats.skipped.push(`combo:${combo._id}: missing vendor/category`);
      continue;
    }

    const data = {
      legacyMongoId: toLegacyId(combo._id),
      vendorId,
      platformCategoryId,
      vendorSectionId,
      name: combo.name,
      description: combo.description || null,
      imageUrl: combo.image_url || null,
      price: combo.price || 0,
      dietaryType: mapDietaryType(combo.dietary_type),
      prepTimeMinutes: combo.prep_time_minutes ?? null,
      tags: combo.tags || [],
      contents: combo.contents || [],
      choiceGroups: normalizeComboChoiceGroups(combo.choice_groups),
      isAvailable: combo.is_available !== false,
      isInStock: combo.is_in_stock !== false,
      isArchived: combo.is_archived || false,
      sortOrder: combo.sort_order || 0,
      rating: combo.rating || 0,
      ratingCount: combo.ratingCount || 0,
      createdAt: asDate(combo.createdAt),
      updatedAt: asDate(combo.updatedAt),
    };

    await write(`combo ${combo._id}`, () =>
      prisma.comboItem.upsert({
        where: { legacyMongoId: data.legacyMongoId },
        create: data,
        update: data,
      }), dryRun);
    stats.combos += 1;
  }
};

const importAll = async () => {
  const { dryRun, limit } = parseArgs();

  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  await mongoose.connect(process.env.MONGO_URI);

  try {
    await importStates(dryRun);
    await importCities(dryRun);
    await importCategories(dryRun);
    await importVendors(dryRun, limit);
    await importSections(dryRun);
    await importMenuItems(dryRun);
    await importPortions(dryRun);
    await importChoiceGroups(dryRun);
    await importChoiceOptions(dryRun);
    await importCombos(dryRun);

    console.log(JSON.stringify({ dryRun, stats }, null, 2));
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
};

importAll().catch(async (error) => {
  console.error("Mongo to Postgres menu import failed:", error);
  await mongoose.disconnect().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
