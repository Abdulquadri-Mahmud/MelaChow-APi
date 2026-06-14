import prisma from "../../config/prisma.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const legacyId = (record) => record?.legacyMongoId || record?.id || null;

const resolveLegacyIds = async (model, ids = []) => {
  if (!ids?.length) return [];

  const uniqueIds = [...new Set(ids.map(String).filter(Boolean))];
  const uuidIds = uniqueIds.filter((id) => uuidPattern.test(id));
  const legacyIds = uniqueIds.filter((id) => !uuidPattern.test(id));

  const rows = await model.findMany({
    where: {
      OR: [
        ...(uuidIds.length ? [{ id: { in: uuidIds } }] : []),
        ...(legacyIds.length ? [{ legacyMongoId: { in: legacyIds } }] : []),
      ],
    },
    select: { id: true },
  });

  return rows.map((row) => row.id);
};

const categoryPublicShape = (category) => {
  if (!category) return null;

  return {
    id: legacyId(category),
    name: category.name,
    slug: category.slug,
    parent: category.parent
      ? {
          id: legacyId(category.parent),
          name: category.parent.name,
          slug: category.parent.slug,
        }
      : null,
  };
};

const resolveDeliveryFee = (vendor) => {
  const override = vendor?.platformDeliveryFeeOverride;
  const cityFee = vendor?.city?.platformDeliveryFee || 0;
  return override != null && override > 0 ? override : cityFee;
};

const restaurantShape = (vendor) => ({
  _id: legacyId(vendor),
  storeName: vendor?.storeName,
  logo: vendor?.logo,
  storeSlug: vendor?.storeSlug,
  city: vendor?.address?.city,
  state: vendor?.address?.state,
  rating: vendor?.rating,
  openingHours: vendor?.openingHours,
  hasActiveDeliveryPromo: false,
  activeDeliveryPromo: null,
});

const portionSummaryShape = (portion) => ({
  _id: legacyId(portion),
  label: portion.label,
  price_naira: portion.price / 100,
  is_default: portion.isDefault,
});

const searchItemShape = (item, { includePortions = true } = {}) => {
  const cheapest = (item.portions || [])[0];

  return {
    _id: legacyId(item),
    name: item.name,
    image: item.imageUrl || "",
    price: cheapest ? cheapest.price / 100 : null,
    portionLabel: cheapest?.label ?? null,
    deliveryFee: resolveDeliveryFee(item.vendor),
    item_type: item.itemType,
    dietary_type: item.dietaryType === "non_veg" ? "non-veg" : item.dietaryType,
    is_available: item.isAvailable ?? true,
    is_in_stock: item.isInStock ?? true,
    rating: item.rating || 0,
    ratingCount: item.ratingCount || 0,
    tags: item.tags || [],
    portions: includePortions ? (item.portions || []).map(portionSummaryShape) : [],
    choiceGroups: [],
    platform_category: categoryPublicShape(item.platformCategory),
    restaurant: restaurantShape(item.vendor),
  };
};

const searchComboShape = (combo) => ({
  _id: legacyId(combo),
  name: combo.name,
  image: combo.imageUrl || "",
  price: combo.price / 100,
  portionLabel: "Combo",
  deliveryFee: resolveDeliveryFee(combo.vendor),
  item_type: "combo",
  dietary_type: combo.dietaryType === "non_veg" ? "non-veg" : combo.dietaryType,
  is_available: combo.isAvailable ?? true,
  is_in_stock: combo.isInStock ?? true,
  rating: combo.rating || 0,
  ratingCount: combo.ratingCount || 0,
  tags: combo.tags || [],
  portions: [],
  choiceGroups: combo.choiceGroups || [],
  platform_category: categoryPublicShape(combo.platformCategory),
  restaurant: restaurantShape(combo.vendor),
});

const vendorSearchShape = (vendor) => ({
  _id: legacyId(vendor),
  storeName: vendor.storeName,
  logo: vendor.logo,
  coverImage: vendor.coverImage,
  storeSlug: vendor.storeSlug,
  storeDescription: vendor.storeDescription,
  address: vendor.address,
  rating: vendor.rating,
  openingHours: vendor.openingHours,
  platformDeliveryFeeOverride: vendor.platformDeliveryFeeOverride,
  hasActiveDeliveryPromo: vendor.hasActiveDeliveryPromo,
});

const itemInclude = {
  vendor: {
    include: {
      city: {
        select: { platformDeliveryFee: true },
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
  portions: {
    orderBy: { price: "asc" },
  },
  choiceGroups: {
    orderBy: { sortOrder: "asc" },
    include: {
      options: {
        where: { isAvailable: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  },
};

const comboInclude = {
  vendor: {
    include: {
      city: {
        select: { platformDeliveryFee: true },
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
};

const buildTextWhere = (q) => {
  if (!q?.trim()) return [];
  const term = q.trim();

  return [
    { name: { contains: term, mode: "insensitive" } },
    { description: { contains: term, mode: "insensitive" } },
    { tags: { has: term } },
  ];
};

const orderByFor = (sort) => {
  if (sort === "rating_desc") return [{ ratingCount: "desc" }, { rating: "desc" }];
  if (sort === "newest") return [{ createdAt: "desc" }];
  return [{ createdAt: "desc" }];
};

export const searchRepository = {
  async resolveVendorIds(vendorIds) {
    if (vendorIds === null) return null;
    return resolveLegacyIds(prisma.vendor, vendorIds);
  },

  async resolveCategoryId(category) {
    if (!category) return null;

    const where = uuidPattern.test(String(category))
      ? { id: String(category) }
      : {
          OR: [
            { legacyMongoId: String(category) },
            { name: { equals: String(category).trim(), mode: "insensitive" } },
          ],
        };

    const row = await prisma.category.findFirst({
      where,
      select: { id: true },
    });

    return row?.id || null;
  },

  async findVendorNameMatches(q, resolvedVendorIds) {
    if (!q?.trim()) return [];
    const term = q.trim();

    return prisma.vendor.findMany({
      where: {
        active: true,
        suspended: false,
        deletedAt: null,
        ...(resolvedVendorIds !== null ? { id: { in: resolvedVendorIds } } : {}),
        OR: [
          { storeName: { contains: term, mode: "insensitive" } },
          { storeSlug: { contains: term, mode: "insensitive" } },
          { storeDescription: { contains: term, mode: "insensitive" } },
        ],
      },
    });
  },

  async autocomplete({ q, limit = 8, vendorIds = null, userCity = null, userState = null }) {
    const limitNum = Number(limit);
    const resolvedVendorIds = await this.resolveVendorIds(vendorIds);
    if (resolvedVendorIds !== null && resolvedVendorIds.length === 0) {
      return {
        success: true,
        count: 0,
        suggestions: [],
        location: { city: userCity, state: userState },
        message: `No results found in ${userCity || ""} ${userState || ""}`.trim(),
      };
    }

    const vendorMatches = await this.findVendorNameMatches(q, resolvedVendorIds);
    const vendorMatchIds = vendorMatches.map((vendor) => vendor.id);
    const textWhere = buildTextWhere(q);
    const baseWhere = {
      isAvailable: true,
      isInStock: true,
      isArchived: false,
      ...(resolvedVendorIds !== null ? { vendorId: { in: resolvedVendorIds } } : {}),
      OR: [...textWhere, ...(vendorMatchIds.length ? [{ vendorId: { in: vendorMatchIds } }] : [])],
    };

    const [menus, combos] = await Promise.all([
      prisma.menuItem.findMany({
        where: baseWhere,
        orderBy: [{ ratingCount: "desc" }, { rating: "desc" }],
        take: limitNum,
        include: itemInclude,
      }),
      prisma.comboItem.findMany({
        where: baseWhere,
        orderBy: [{ ratingCount: "desc" }, { rating: "desc" }],
        take: limitNum,
        include: comboInclude,
      }),
    ]);

    const suggestions = [
      ...menus.map((item) => searchItemShape(item)),
      ...combos.map(searchComboShape),
    ]
      .sort((a, b) => (b.ratingCount || 0) - (a.ratingCount || 0))
      .slice(0, limitNum);

    return {
      success: true,
      count: suggestions.length,
      suggestions,
      location: { city: userCity, state: userState },
    };
  },

  async search({ q, category, available, sort, page = 1, limit = 10, vendorIds = null, userCity = null, userState = null }) {
    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;
    const resolvedVendorIds = await this.resolveVendorIds(vendorIds);

    if (resolvedVendorIds !== null && resolvedVendorIds.length === 0) {
      return {
        success: true,
        message: `No vendors found in ${userCity || ""} ${userState || ""}`.trim(),
        count: 0,
        total: 0,
        data: [],
        vendors: [],
        city: userCity || "Unknown",
        state: userState || "Unknown",
      };
    }

    const categoryId = category ? await this.resolveCategoryId(category) : null;
    if (category && !categoryId) {
      return {
        success: true,
        count: 0,
        total: 0,
        data: [],
        vendors: [],
        city: userCity || "Unknown",
        state: userState || "Unknown",
      };
    }

    const vendorMatches = await this.findVendorNameMatches(q, resolvedVendorIds);
    const vendorMatchIds = vendorMatches.map((vendor) => vendor.id);
    const textWhere = buildTextWhere(q);
    const baseWhere = {
      isInStock: true,
      isArchived: false,
      ...(available === "false" ? {} : { isAvailable: true }),
      ...(resolvedVendorIds !== null ? { vendorId: { in: resolvedVendorIds } } : {}),
      ...(categoryId ? { platformCategoryId: categoryId } : {}),
      ...(q?.trim() ? { OR: [...textWhere, ...(vendorMatchIds.length ? [{ vendorId: { in: vendorMatchIds } }] : [])] } : {}),
    };
    const sortOption = orderByFor(sort);

    const [menus, combos, menusTotal, combosTotal] = await Promise.all([
      prisma.menuItem.findMany({
        where: baseWhere,
        skip,
        take: limitNum,
        orderBy: sortOption,
        include: itemInclude,
      }),
      prisma.comboItem.findMany({
        where: baseWhere,
        skip,
        take: limitNum,
        orderBy: sortOption,
        include: comboInclude,
      }),
      prisma.menuItem.count({ where: baseWhere }),
      prisma.comboItem.count({ where: baseWhere }),
    ]);

    const total = menusTotal + combosTotal;
    const data = [
      ...menus.map((item) => searchItemShape(item)),
      ...combos.map(searchComboShape),
    ]
      .sort((a, b) => {
        if (sort === "rating_desc") return (b.ratingCount || 0) - (a.ratingCount || 0);
        return 0;
      })
      .slice(0, limitNum);

    return {
      success: true,
      city: userCity || "Unknown",
      state: userState || "Unknown",
      count: data.length,
      total,
      currentPage: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data,
      vendors: vendorMatches.map(vendorSearchShape),
    };
  },
};
