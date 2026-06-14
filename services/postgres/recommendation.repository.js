import prisma from "../../config/prisma.js";

const legacyId = (record) => record?.legacyMongoId || record?.id || null;

const dietaryShape = (value) => (value === "non_veg" ? "non-veg" : value);

const tagMatches = (record, tags) => {
  const wanted = tags.map((tag) => String(tag).toLowerCase());
  return (record.tags || []).some((tag) => {
    const value = String(tag).toLowerCase();
    return wanted.some((wantedTag) => value.includes(wantedTag));
  });
};

const getTimeOfDayContext = () => {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 11) {
    return { label: "Breakfast", tags: ["Breakfast", "Coffee", "Egg", "Pancakes", "Tea", "Bread"] };
  }
  if (hour >= 11 && hour < 16) {
    return { label: "Lunch", tags: ["Rice", "Pasta", "Sandwich", "Salad", "Amala", "Swallow"] };
  }
  if (hour >= 16 && hour < 22) {
    return { label: "Dinner", tags: ["Soup", "Grill", "Steak", "Dinner", "Suya", "Fish"] };
  }

  return { label: "Late Night", tags: ["Snacks", "Fast Food", "Noodles", "Burger", "Pizza"] };
};

const getWeatherTags = (condition) => {
  const map = {
    rain: ["Soup", "Hot", "Tea", "Coffee", "Pepper soup", "Ramen"],
    cold: ["Soup", "Spicy", "Hot", "Tea"],
    hot: ["Ice cream", "Cold drink", "Salad", "Juice", "Smoothie", "Parfait"],
    cloudy: ["Coffee", "Tea", "Bakery"],
    clear: ["Grill", "Barbecue", "Picnic"],
  };
  return map[condition?.toLowerCase()] || [];
};

const vendorSelect = {
  id: true,
  legacyMongoId: true,
  storeName: true,
  logo: true,
  address: true,
  openingHours: true,
  platformDeliveryFeeOverride: true,
  city: {
    select: {
      platformDeliveryFee: true,
    },
  },
};

const menuInclude = {
  vendor: {
    select: vendorSelect,
  },
  portions: {
    where: { isAvailable: true },
    orderBy: { price: "asc" },
  },
};

const comboInclude = {
  vendor: {
    select: vendorSelect,
  },
};

const baseMenuWhere = (vendorIds = []) => ({
  isAvailable: true,
  isInStock: true,
  isArchived: false,
  ...(vendorIds.length > 0 ? { vendorId: { in: vendorIds } } : {}),
});

const baseComboWhere = (vendorIds = []) => ({
  isAvailable: true,
  isInStock: true,
  isArchived: false,
  ...(vendorIds.length > 0 ? { vendorId: { in: vendorIds } } : {}),
});

const resolveDeliveryFee = (vendor) => {
  if (!vendor) return 0;
  if (vendor.platformDeliveryFeeOverride > 0) return vendor.platformDeliveryFeeOverride;
  return vendor.city?.platformDeliveryFee || 0;
};

const recommendationItemShape = (item) => {
  const isCombo = item.item_type === "combo";
  const vendor = item.vendor || {};
  const cheapest = item.portions?.[0];

  return {
    _id: legacyId(item),
    name: item.name,
    image: item.imageUrl || "",
    price: isCombo ? item.price / 100 : cheapest ? cheapest.price / 100 : null,
    portionLabel: isCombo ? "Combo" : cheapest?.label || null,
    item_type: isCombo ? "combo" : item.itemType,
    dietary_type: dietaryShape(item.dietaryType) || "mixed",
    tags: item.tags || [],
    rating: item.rating || 0,
    ratingCount: item.ratingCount || 0,
    deliveryFee: resolveDeliveryFee(vendor),
    restaurant: {
      _id: legacyId(vendor),
      storeName: vendor.storeName,
      logo: vendor.logo,
      city: vendor.address?.city,
      state: vendor.address?.state,
      openingHours: vendor.openingHours,
    },
  };
};

const findLocationVendorIds = async ({ city, state }) => {
  const and = [{ active: true }, { suspended: false }, { deletedAt: null }];
  const or = [];
  const trimmedCity = city?.trim();
  const trimmedState = state?.trim();

  if (trimmedCity && trimmedState) {
    or.push({
      AND: [
        { address: { path: ["city"], string_contains: trimmedCity } },
        { address: { path: ["state"], string_contains: trimmedState } },
      ],
    });
  }

  let stateRecord = null;
  let cityRecord = null;
  if (trimmedState) {
    stateRecord = await prisma.state.findFirst({
      where: {
        name: { equals: trimmedState, mode: "insensitive" },
        isActive: true,
      },
      select: { id: true },
    });
  }

  if (stateRecord && trimmedCity) {
    cityRecord = await prisma.city.findFirst({
      where: {
        stateId: stateRecord.id,
        name: { equals: trimmedCity, mode: "insensitive" },
        isActive: true,
      },
      select: { id: true },
    });
  }

  if (stateRecord && cityRecord) {
    or.push({ stateId: stateRecord.id, cityId: cityRecord.id });
  }

  const vendors = await prisma.vendor.findMany({
    where: {
      AND: and,
      ...(or.length > 0 ? { OR: or } : {}),
    },
    select: { id: true },
  });

  return vendors.map((vendor) => vendor.id);
};

const listTaggedRecommendations = async ({ tags, vendorIds, sortField, limit }) => {
  const [menuItems, combos] = await Promise.all([
    prisma.menuItem.findMany({
      where: baseMenuWhere(vendorIds),
      orderBy: { [sortField]: "desc" },
      include: menuInclude,
    }),
    prisma.comboItem.findMany({
      where: baseComboWhere(vendorIds),
      orderBy: { [sortField]: "desc" },
      include: comboInclude,
    }),
  ]);

  return [
    ...menuItems.filter((item) => tagMatches(item, tags)),
    ...combos.filter((combo) => tagMatches(combo, tags)).map((combo) => ({ ...combo, item_type: "combo" })),
  ]
    .sort((left, right) => (right[sortField] || 0) - (left[sortField] || 0))
    .slice(0, limit)
    .map(recommendationItemShape);
};

const listUnderratedRecommendations = async ({ vendorIds }) => {
  const [menuItems, combos] = await Promise.all([
    prisma.menuItem.findMany({
      where: {
        ...baseMenuWhere(vendorIds),
        rating: { gte: 4 },
        ratingCount: { lt: 50 },
      },
      orderBy: { rating: "desc" },
      take: 6,
      include: menuInclude,
    }),
    prisma.comboItem.findMany({
      where: {
        ...baseComboWhere(vendorIds),
        rating: { gte: 4 },
        ratingCount: { lt: 50 },
      },
      orderBy: { rating: "desc" },
      take: 6,
      include: comboInclude,
    }),
  ]);

  return [...menuItems, ...combos.map((combo) => ({ ...combo, item_type: "combo" }))]
    .sort((left, right) => (right.rating || 0) - (left.rating || 0))
    .slice(0, 6)
    .map(recommendationItemShape);
};

const listTrendingNearby = async ({ city }) => {
  if (!city?.trim()) return [];

  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: twoDaysAgo },
      deliveryAddress: {
        path: ["city"],
        string_contains: city.trim(),
      },
      orderStatus: "delivered",
    },
    select: {
      items: {
        select: {
          foodId: true,
        },
      },
    },
  });

  const counts = new Map();
  for (const order of orders) {
    for (const item of order.items || []) {
      if (!item.foodId) continue;
      counts.set(item.foodId, (counts.get(item.foodId) || 0) + 1);
    }
  }

  const trendingIds = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([id]) => id);

  if (!trendingIds.length) return [];

  const items = await prisma.menuItem.findMany({
    where: {
      id: { in: trendingIds },
      isAvailable: true,
      isInStock: true,
      isArchived: false,
    },
    include: menuInclude,
  });

  const orderMap = {};
  trendingIds.forEach((id, index) => {
    orderMap[id] = index;
  });

  return items
    .sort((left, right) => (orderMap[left.id] ?? 99) - (orderMap[right.id] ?? 99))
    .map(recommendationItemShape);
};

const listBudgetFriendly = async ({ vendorIds }) => {
  const [menuItems, combos] = await Promise.all([
    prisma.menuItem.findMany({
      where: {
        ...baseMenuWhere(vendorIds),
        portions: {
          some: {
            price: { lte: 250000 },
            isAvailable: true,
          },
        },
      },
      take: 20,
      include: menuInclude,
    }),
    prisma.comboItem.findMany({
      where: {
        ...baseComboWhere(vendorIds),
        price: { lte: 250000 },
      },
      take: 20,
      include: comboInclude,
    }),
  ]);

  return [
    ...menuItems.map((item) => ({ ...item, finalPrice: item.portions?.[0]?.price ?? Infinity })),
    ...combos.map((combo) => ({ ...combo, item_type: "combo", finalPrice: combo.price })),
  ]
    .sort((left, right) => left.finalPrice - right.finalPrice)
    .slice(0, 8)
    .map(recommendationItemShape);
};

export const recommendationRepository = {
  async getRecommendations({ city, state, weather } = {}) {
    const timeContext = getTimeOfDayContext();
    const vendorIds = await findLocationVendorIds({ city, state });

    if (vendorIds.length === 0 && (city || state)) {
      return {
        success: true,
        meta: {
          timeOfDayLabel: timeContext.label,
          weatherCondition: weather || null,
          location: { city, state },
        },
        data: {
          timeOfDay: [],
          underrated: [],
          weatherBased: [],
          trendingNearby: [],
          budgetFriendly: [],
        },
      };
    }

    const weatherTags = getWeatherTags(weather);
    const [timeOfDay, underrated, weatherBased, trendingNearby, budgetFriendly] = await Promise.all([
      listTaggedRecommendations({ tags: timeContext.tags, vendorIds, sortField: "ratingCount", limit: 6 }),
      listUnderratedRecommendations({ vendorIds }),
      weatherTags.length
        ? listTaggedRecommendations({ tags: weatherTags, vendorIds, sortField: "ratingCount", limit: 6 })
        : Promise.resolve([]),
      listTrendingNearby({ city }),
      listBudgetFriendly({ vendorIds }),
    ]);

    return {
      success: true,
      meta: {
        timeOfDayLabel: timeContext.label,
        weatherCondition: weather || null,
        location: { city, state },
      },
      data: {
        timeOfDay,
        underrated,
        weatherBased,
        trendingNearby,
        budgetFriendly,
      },
    };
  },
};
