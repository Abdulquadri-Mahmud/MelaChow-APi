import prisma from "../../config/prisma.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const idWhere = (id) => (uuidPattern.test(String(id)) ? { id } : { legacyMongoId: String(id) });

const resolveId = async (model, id) => {
  if (!id) return null;
  if (uuidPattern.test(String(id))) return String(id);

  const record = await model.findUnique({
    where: { legacyMongoId: String(id) },
    select: { id: true },
  });

  return record?.id || null;
};

const legacyId = (record) => record?.legacyMongoId || record?.id || null;

const categoryShape = (category) => {
  if (!category) return null;
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    parent: category.parent
      ? {
          id: category.parent.id,
          name: category.parent.name,
          slug: category.parent.slug,
        }
      : null,
  };
};

const categorySummaryShape = (category) => {
  if (!category) return null;
  return {
    _id: legacyId(category),
    name: category.name,
    parent: category.parent
      ? {
          _id: legacyId(category.parent),
          name: category.parent.name,
        }
      : null,
  };
};

const sectionShape = (section) => ({
  _id: legacyId(section),
  vendor_id: section.vendor?.legacyMongoId || section.vendorId,
  name: section.name,
  description: section.description,
  sort_order: section.sortOrder,
  is_visible: section.isVisible,
  deleted_at: section.deletedAt,
  createdAt: section.createdAt,
  updatedAt: section.updatedAt,
  __v: 0,
});

const portionShape = (portion) => ({
  _id: legacyId(portion),
  menu_item_id: portion.menuItem?.legacyMongoId || portion.menuItemId,
  label: portion.label,
  price: portion.price,
  is_default: portion.isDefault,
  is_available: portion.isAvailable,
  is_in_stock: portion.isInStock,
  max_quantity: portion.maxQuantity,
  sort_order: portion.sortOrder,
  createdAt: portion.createdAt,
  updatedAt: portion.updatedAt,
  __v: 0,
  price_naira: (portion.price || 0) / 100,
});

const choiceOptionShape = (option) => ({
  _id: legacyId(option),
  label: option.label,
  image_url: option.imageUrl,
  price_modifier: option.priceModifier,
  price_modifier_naira: (option.priceModifier || 0) / 100,
  is_available: option.isAvailable,
  sort_order: option.sortOrder,
});

const choiceGroupShape = (group) => ({
  _id: legacyId(group),
  menu_item_id: group.menuItem?.legacyMongoId || group.menuItemId,
  name: group.name,
  image_url: group.imageUrl || null,
  min_selections: group.minSelections,
  max_selections: group.maxSelections,
  is_required: group.isRequired,
  sort_order: group.sortOrder,
  createdAt: group.createdAt,
  updatedAt: group.updatedAt,
  __v: 0,
  options: (group.options || []).map(choiceOptionShape),
});

const menuItemBaseShape = (item) => ({
  _id: legacyId(item),
  vendor_id: item.vendor?.legacyMongoId || item.vendorId,
  platform_category_id: item.platformCategory?.legacyMongoId || item.platformCategoryId,
  vendor_section_id: item.vendorSection?.legacyMongoId || item.vendorSectionId,
  name: item.name,
  description: item.description,
  image_url: item.imageUrl,
  item_type: item.itemType,
  dietary_type: item.dietaryType === "non_veg" ? "non-veg" : item.dietaryType,
  is_available: item.isAvailable,
  is_in_stock: item.isInStock,
  is_archived: item.isArchived,
  category_deactivated: item.categoryDeactivated,
  sort_order: item.sortOrder,
  prep_time_minutes: item.prepTimeMinutes,
  tags: item.tags,
  rating: item.rating,
  ratingCount: item.ratingCount,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  __v: 0,
});

const fullMenuItemShape = (item) => ({
  ...menuItemBaseShape(item),
  vendor: vendorStorefrontShape(item.vendor),
  platform_category: categoryShape(item.platformCategory),
  portions: (item.portions || []).map(portionShape),
  choice_groups: (item.choiceGroups || []).map(choiceGroupShape),
});

const comboChoiceGroupShape = (group) => ({
  _id: group._id,
  name: group.name,
  image_url: group.image_url || null,
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
});

const comboShape = (combo) => ({
  _id: legacyId(combo),
  vendor_id: combo.vendor?.legacyMongoId || combo.vendorId,
  platform_category_id: combo.platformCategory?.legacyMongoId || combo.platformCategoryId,
  vendor_section_id: combo.vendorSection?.legacyMongoId || combo.vendorSectionId,
  name: combo.name,
  description: combo.description || null,
  image_url: combo.imageUrl,
  price: combo.price,
  price_naira: Math.round((combo.price || 0) / 100),
  contents: combo.contents || [],
  dietary_type: combo.dietaryType === "non_veg" ? "non-veg" : combo.dietaryType,
  prep_time_minutes: combo.prepTimeMinutes,
  tags: combo.tags || [],
  choice_groups: (combo.choiceGroups || []).map(comboChoiceGroupShape),
  is_available: combo.isAvailable,
  is_in_stock: combo.isInStock,
  is_archived: combo.isArchived,
  sort_order: combo.sortOrder,
  rating: combo.rating,
  ratingCount: combo.ratingCount,
  createdAt: combo.createdAt,
  updatedAt: combo.updatedAt,
  platform_category: categoryShape(combo.platformCategory),
  vendor: vendorStorefrontShape(combo.vendor),
});

const comboDetailShape = (combo) => ({
  _id: legacyId(combo),
  name: combo.name,
  description: combo.description || null,
  image_url: combo.imageUrl || null,
  price_naira: Math.round((combo.price || 0) / 100),
  contents: combo.contents || [],
  dietary_type: combo.dietaryType === "non_veg" ? "non-veg" : combo.dietaryType,
  tags: combo.tags || [],
  is_available: combo.isAvailable,
  deliveryFee: 0,
  vendor: vendorStorefrontShape(combo.vendor),
  choice_groups: (combo.choiceGroups || []).map((group) => ({
    _id: group._id,
    name: group.name,
    is_required: group.is_required,
    min_selections: group.min_selections,
    max_selections: group.max_selections,
    options: (group.options || []).map((option) => ({
      _id: option._id,
      label: option.label,
      image_url: option.image_url || null,
      price_modifier_naira: Math.round((option.price_modifier || 0) / 100),
      is_available: option.is_available !== false,
    })),
  })),
});

const vendorComboReadShape = (combo) => ({
  _id: legacyId(combo),
  vendor_id: combo.vendor?.legacyMongoId || combo.vendorId,
  platform_category_id: combo.platformCategory?.legacyMongoId || combo.platformCategoryId,
  vendor_section_id: combo.vendorSection?.legacyMongoId || combo.vendorSectionId,
  name: combo.name,
  description: combo.description,
  image_url: combo.imageUrl,
  price: combo.price,
  dietary_type: combo.dietaryType === "non_veg" ? "non-veg" : combo.dietaryType,
  prep_time_minutes: combo.prepTimeMinutes,
  tags: combo.tags || [],
  contents: combo.contents || [],
  choice_groups: (combo.choiceGroups || []).map((group) => ({
    ...group,
    options: (group.options || []).map((option) => ({
      ...option,
      price_modifier_naira: Math.round((option.price_modifier || 0) / 100),
    })),
  })),
  is_available: combo.isAvailable,
  is_in_stock: combo.isInStock,
  is_archived: combo.isArchived,
  sort_order: combo.sortOrder,
  rating: combo.rating,
  ratingCount: combo.ratingCount,
  createdAt: combo.createdAt,
  updatedAt: combo.updatedAt,
  __v: 0,
  price_naira: (combo.price || 0) / 100,
});

const marketplaceItemShape = (item) => ({
  ...menuItemBaseShape(item),
  vendor_id: item.vendor
    ? {
        _id: legacyId(item.vendor),
        storeName: item.vendor.storeName,
        logo: item.vendor.logo,
        address: item.vendor.address,
      }
    : item.vendorId,
  portions: (item.portions || []).map((portion) => {
    const { price_naira, ...shaped } = portionShape(portion);
    return shaped;
  }),
});

const vendorMenuListItemShape = (item) => {
  const prices = (item.portions || []).map((portion) => portion.price).filter((price) => price != null);
  const defaultPortion = (item.portions || []).find((portion) => portion.isDefault);
  const defaultPrice = defaultPortion?.price ?? null;

  return {
    _id: legacyId(item),
    name: item.name,
    description: item.description,
    image_url: item.imageUrl,
    item_type: item.itemType,
    dietary_type: item.dietaryType === "non_veg" ? "non-veg" : item.dietaryType,
    is_available: item.isAvailable,
    is_in_stock: item.isInStock,
    is_archived: item.isArchived,
    sort_order: item.sortOrder,
    prep_time_minutes: item.prepTimeMinutes,
    tags: item.tags,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    category: item.platformCategory
      ? {
          _id: legacyId(item.platformCategory),
          name: item.platformCategory.name,
          slug: item.platformCategory.slug,
        }
      : null,
    section: item.vendorSection
      ? {
          _id: legacyId(item.vendorSection),
          name: item.vendorSection.name,
        }
      : null,
    portions: {
      count: item.portions?.length || 0,
      default_price: defaultPrice,
      default_price_naira: defaultPrice ? defaultPrice / 100 : null,
      min_price_naira: prices.length ? Math.min(...prices) / 100 : null,
      max_price_naira: prices.length ? Math.max(...prices) / 100 : null,
    },
    choice_groups: {
      count: item.choiceGroups?.length || 0,
    },
    combos: [],
  };
};

const vendorStorefrontShape = (vendor) => {
  if (!vendor) return null;

  const cityDeliveryFee = vendor.city?.platformDeliveryFee || 0;
  const deliveryFeeKobo = vendor.platformDeliveryFeeOverride ?? cityDeliveryFee;

  return {
    _id: legacyId(vendor),
    storeName: vendor.storeName,
    logo: vendor.logo,
    coverImage: vendor.coverImage || null,
    description: vendor.storeDescription,
    cuisineTypes: vendor.cuisineTypes || [],
    address: vendor.address,
    isOpen: true,
    openingHours: vendor.openingHours,
    acceptsDelivery: vendor.acceptsDelivery,
    deliveryFee: Math.round((deliveryFeeKobo || 0) / 100),
    estimatedDeliveryTime: 30,
    rating: vendor.rating ?? null,
    ratingCount: vendor.ratingCount ?? 0,
    storeSlug: vendor.storeSlug,
    hasActiveDeliveryPromo: vendor.hasActiveDeliveryPromo || false,
    activeDeliveryPromo: null,
  };
};

const itemInclude = ({ vendorView = false } = {}) => ({
  vendor: {
    include: {
      city: {
        select: {
          platformDeliveryFee: true,
        },
      },
    },
  },
  platformCategory: {
    include: {
      parent: {
        select: {
          id: true,
          legacyMongoId: true,
          name: true,
          slug: true,
        },
      },
    },
  },
  vendorSection: {
    include: {
      vendor: {
        select: {
          id: true,
          legacyMongoId: true,
        },
      },
    },
  },
  portions: {
    where: vendorView ? {} : { isAvailable: true },
    orderBy: { sortOrder: "asc" },
  },
  choiceGroups: {
    orderBy: { sortOrder: "asc" },
    include: {
      options: {
        where: vendorView ? {} : { isAvailable: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  },
});

const comboInclude = {
  vendor: {
    include: {
      city: {
        select: {
          platformDeliveryFee: true,
        },
      },
    },
  },
  platformCategory: {
    include: {
      parent: {
        select: {
          id: true,
          legacyMongoId: true,
          name: true,
          slug: true,
        },
      },
    },
  },
  vendorSection: true,
};

export const menuCatalogRepository = {
  async getVendorStorefront(vendorId) {
    const resolvedVendorId = await resolveId(prisma.vendor, vendorId);
    if (!resolvedVendorId) return null;

    const vendor = await prisma.vendor.findFirst({
      where: {
        id: resolvedVendorId,
        active: true,
        deletedAt: null,
      },
      include: {
        city: {
          select: {
            platformDeliveryFee: true,
          },
        },
      },
    });

    return vendorStorefrontShape(vendor);
  },

  async getFullVendorMenu(vendorId) {
    const vendor = await this.getVendorStorefront(vendorId);
    if (!vendor) return null;

    const [sections, items, combos] = await Promise.all([
      this.listVisibleSectionsByVendor(vendorId),
      this.listPublicItemsByVendor(vendorId),
      this.listPublicCombosByVendor(vendorId),
    ]);

    const sectionMap = {};
    for (const section of sections) {
      sectionMap[String(section._id)] = {
        ...section,
        items: [],
      };
    }

    const unsectioned = [];
    for (const item of items) {
      const sectionId = item.vendor_section_id ? String(item.vendor_section_id) : null;
      const summaryItem = {
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
        platform_category: categorySummaryShape(item.platformCategory || item.platform_category),
        portions: {
          count: item.portions.length,
          default_price_naira: item.portions.find((portion) => portion.is_default)?.price_naira || item.portions[0]?.price_naira || 0,
          min_price_naira: item.portions.length ? Math.round(Math.min(...item.portions.map((portion) => portion.price || 0)) / 100) : 0,
          max_price_naira: item.portions.length ? Math.round(Math.max(...item.portions.map((portion) => portion.price || 0)) / 100) : 0,
        },
      };

      if (sectionId && sectionMap[sectionId]) {
        sectionMap[sectionId].items.push(summaryItem);
      } else {
        unsectioned.push(summaryItem);
      }
    }

    const populatedSections = sections
      .map((section) => sectionMap[String(section._id)])
      .filter((section) => section.items.length > 0);

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
      vendor,
      combos,
      sections: populatedSections,
      unsectioned,
    };
  },

  async listVisibleSectionsByVendor(vendorId) {
    const resolvedVendorId = await resolveId(prisma.vendor, vendorId);
    if (!resolvedVendorId) return [];

    const sections = await prisma.vendorMenuSection.findMany({
      where: {
        vendorId: resolvedVendorId,
        deletedAt: null,
        isVisible: true,
      },
      orderBy: { sortOrder: "asc" },
      include: {
        vendor: {
          select: {
            id: true,
            legacyMongoId: true,
          },
        },
      },
    });

    return sections.map(sectionShape);
  },

  async listSectionsByVendor(vendorId) {
    const resolvedVendorId = await resolveId(prisma.vendor, vendorId);
    if (!resolvedVendorId) return [];

    const sections = await prisma.vendorMenuSection.findMany({
      where: {
        vendorId: resolvedVendorId,
        deletedAt: null,
      },
      orderBy: { sortOrder: "asc" },
      include: {
        vendor: {
          select: {
            id: true,
            legacyMongoId: true,
          },
        },
      },
    });

    return sections.map(sectionShape);
  },

  async listPublicItemsByVendor(vendorId) {
    const resolvedVendorId = await resolveId(prisma.vendor, vendorId);
    if (!resolvedVendorId) return [];

    const items = await prisma.menuItem.findMany({
      where: {
        vendorId: resolvedVendorId,
        isArchived: false,
        isAvailable: true,
        categoryDeactivated: false,
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: itemInclude(),
    });

    return items.map(fullMenuItemShape);
  },

  async listPublicCombosByVendor(vendorId) {
    const resolvedVendorId = await resolveId(prisma.vendor, vendorId);
    if (!resolvedVendorId) return [];

    const combos = await prisma.comboItem.findMany({
      where: {
        vendorId: resolvedVendorId,
        isArchived: false,
        isAvailable: true,
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: comboInclude,
    });

    return combos.map(comboShape);
  },

  async getMenuItemDetails(itemId, { vendorView = false } = {}) {
    const item = await prisma.menuItem.findFirst({
      where: {
        ...idWhere(itemId),
        ...(vendorView ? {} : { isArchived: false, isAvailable: true }),
      },
      include: itemInclude({ vendorView }),
    });

    return item ? fullMenuItemShape(item) : null;
  },

  async getComboDetails(comboId) {
    const combo = await prisma.comboItem.findFirst({
      where: {
        ...idWhere(comboId),
        isArchived: false,
        isAvailable: true,
      },
      include: comboInclude,
    });

    return combo ? comboDetailShape(combo) : null;
  },

  async getComboById(comboId) {
    const combo = await prisma.comboItem.findFirst({
      where: idWhere(comboId),
      include: comboInclude,
    });

    return combo ? vendorComboReadShape(combo) : null;
  },

  async listVendorCombos(vendorId, { is_available, is_archived, search, page = 1, limit = 10 } = {}) {
    const resolvedVendorId = await resolveId(prisma.vendor, vendorId);
    if (!resolvedVendorId) {
      return {
        combos: [],
        pagination: { total: 0, page: 1, limit: 10, pages: 0, hasMore: false },
      };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);
    const skip = (pageNum - 1) * limitNum;
    const where = {
      vendorId: resolvedVendorId,
      isArchived: is_archived === "true",
    };

    if (is_available !== undefined) {
      where.isAvailable = is_available === "true";
    }

    if (search && String(search).trim()) {
      const term = String(search).trim();
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { description: { contains: term, mode: "insensitive" } },
        { tags: { has: term } },
        { contents: { has: term } },
      ];
    }

    const [combos, total] = await Promise.all([
      prisma.comboItem.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        include: comboInclude,
      }),
      prisma.comboItem.count({ where }),
    ]);

    const result = combos.map(vendorComboReadShape);

    return {
      combos: result,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
        hasMore: skip + result.length < total,
      },
    };
  },

  async listItemsByPlatformCategory(categoryId, { page = 1, limit = 20 } = {}) {
    const resolvedCategoryId = await resolveId(prisma.category, categoryId);
    if (!resolvedCategoryId) {
      return {
        items: [],
        total: 0,
      };
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;
    const where = {
      platformCategoryId: resolvedCategoryId,
      isArchived: false,
      isAvailable: true,
      isInStock: true,
      categoryDeactivated: false,
    };

    const [items, total] = await Promise.all([
      prisma.menuItem.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        include: itemInclude(),
      }),
      prisma.menuItem.count({ where }),
    ]);

    return {
      items: items.map(marketplaceItemShape),
      total,
    };
  },

  async listVendorIdsByPlatformCategory(categoryId) {
    const resolvedCategoryId = await resolveId(prisma.category, categoryId);
    if (!resolvedCategoryId) return [];

    const rows = await prisma.menuItem.findMany({
      where: {
        platformCategoryId: resolvedCategoryId,
        isArchived: false,
        isAvailable: true,
        isInStock: true,
        categoryDeactivated: false,
      },
      distinct: ["vendorId"],
      select: {
        vendor: {
          select: {
            id: true,
            legacyMongoId: true,
          },
        },
      },
    });

    return rows.map((row) => row.vendor.legacyMongoId || row.vendor.id);
  },

  async listVendorMenuItems(vendorId, { section, category, status, search, page = 1, limit = 50 } = {}) {
    const resolvedVendorId = await resolveId(prisma.vendor, vendorId);
    if (!resolvedVendorId) {
      return {
        items: [],
        stats: { total: 0, active: 0, archived: 0, out_of_stock: 0 },
        pagination: { total: 0, page: 1, limit: 50, pages: 0, hasMore: false },
      };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;
    const where = { vendorId: resolvedVendorId };

    if (status === "active") {
      where.isArchived = false;
    } else if (status === "archived") {
      where.isArchived = true;
    }

    if (section) {
      const resolvedSectionId = await resolveId(prisma.vendorMenuSection, section);
      if (!resolvedSectionId) {
        return {
          items: [],
          stats: await this.getVendorMenuItemStats(resolvedVendorId),
          pagination: { total: 0, page: pageNum, limit: limitNum, pages: 0, hasMore: false },
        };
      }
      where.vendorSectionId = resolvedSectionId;
    }

    if (category) {
      const resolvedCategoryId = await resolveId(prisma.category, category);
      if (!resolvedCategoryId) {
        return {
          items: [],
          stats: await this.getVendorMenuItemStats(resolvedVendorId),
          pagination: { total: 0, page: pageNum, limit: limitNum, pages: 0, hasMore: false },
        };
      }
      where.platformCategoryId = resolvedCategoryId;
    }

    if (search && String(search).trim()) {
      where.name = {
        contains: String(search).trim(),
        mode: "insensitive",
      };
    }

    const [items, total, stats] = await Promise.all([
      prisma.menuItem.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [{ isArchived: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
        include: {
          platformCategory: {
            select: {
              id: true,
              legacyMongoId: true,
              name: true,
              slug: true,
            },
          },
          vendorSection: {
            select: {
              id: true,
              legacyMongoId: true,
              name: true,
            },
          },
          portions: true,
          choiceGroups: {
            select: {
              id: true,
            },
          },
        },
      }),
      prisma.menuItem.count({ where }),
      this.getVendorMenuItemStats(resolvedVendorId),
    ]);

    return {
      items: items.map(vendorMenuListItemShape),
      stats,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
        hasMore: pageNum * limitNum < total,
      },
    };
  },

  async getVendorMenuItemStats(resolvedVendorId) {
    const [total, active, archived, outOfStock] = await Promise.all([
      prisma.menuItem.count({ where: { vendorId: resolvedVendorId } }),
      prisma.menuItem.count({ where: { vendorId: resolvedVendorId, isArchived: false, isAvailable: true } }),
      prisma.menuItem.count({ where: { vendorId: resolvedVendorId, isArchived: true } }),
      prisma.menuItem.count({ where: { vendorId: resolvedVendorId, isArchived: false, isInStock: false } }),
    ]);

    return {
      total,
      active,
      archived,
      out_of_stock: outOfStock,
    };
  },
};
