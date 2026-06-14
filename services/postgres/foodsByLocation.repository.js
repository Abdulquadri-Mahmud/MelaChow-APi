import prisma from "../../config/prisma.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const legacyId = (record) => record?.legacyMongoId || record?.id || null;

const resolveId = async (model, id) => {
  if (!id) return null;
  if (uuidPattern.test(String(id))) return String(id);

  const record = await model.findUnique({
    where: { legacyMongoId: String(id) },
    select: { id: true },
  });

  return record?.id || null;
};

const categoryShape = (category) => {
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

const restaurantShape = (vendor) => ({
  _id: legacyId(vendor),
  storeName: vendor?.storeName,
  city: vendor?.address?.city,
  state: vendor?.address?.state,
  logo: vendor?.logo,
  openingHours: vendor?.openingHours,
});

const resolveDeliveryFee = (vendor) => {
  const override = vendor?.platformDeliveryFeeOverride;
  const cityFee = vendor?.city?.platformDeliveryFee || 0;
  return override != null && override > 0 ? override : cityFee;
};

const portionShape = (portion) => ({
  _id: legacyId(portion),
  label: portion.label,
  price_naira: portion.price / 100,
  is_default: portion.isDefault,
  max_quantity: portion.maxQuantity || null,
});

const choiceGroupShape = (group) => ({
  _id: legacyId(group),
  menu_item_id: group.menuItem?.legacyMongoId || group.menuItemId,
  name: group.name,
  min_selections: group.minSelections,
  max_selections: group.maxSelections,
  is_required: group.isRequired,
  sort_order: group.sortOrder,
  createdAt: group.createdAt,
  updatedAt: group.updatedAt,
  __v: 0,
});

const foodShape = (item) => {
  const cheapest = (item.portions || [])[0];

  return {
    _id: legacyId(item),
    name: item.name,
    image: item.imageUrl || "",
    price: cheapest ? cheapest.price / 100 : null,
    portionLabel: cheapest?.label || null,
    description: item.description || "",
    deliveryFee: resolveDeliveryFee(item.vendor),
    item_type: item.itemType,
    dietary_type: item.dietaryType === "non_veg" ? "non-veg" : item.dietaryType,
    tags: item.tags || [],
    prep_time_minutes: item.prepTimeMinutes || null,
    platform_category: categoryShape(item.platformCategory),
    portions: (item.portions || []).map(portionShape),
    choiceGroups: (item.choiceGroups || []).map(choiceGroupShape),
    restaurant: restaurantShape(item.vendor),
  };
};

const comboShape = (combo) => ({
  _id: legacyId(combo),
  name: combo.name,
  image: combo.imageUrl || "",
  price: Math.round(combo.price / 100),
  portionLabel: "Combo",
  description: combo.description || "",
  deliveryFee: resolveDeliveryFee(combo.vendor),
  item_type: "combo",
  dietary_type: combo.dietaryType === "non_veg" ? "non-veg" : combo.dietaryType || "mixed",
  tags: combo.tags || [],
  prep_time_minutes: combo.prepTimeMinutes || null,
  platform_category: categoryShape(combo.platformCategory),
  isCombo: true,
  restaurant: restaurantShape(combo.vendor),
});

const vendorInclude = {
  city: {
    select: { platformDeliveryFee: true },
  },
};

const categoryInclude = {
  parent: {
    select: {
      id: true,
      legacyMongoId: true,
      name: true,
      slug: true,
    },
  },
};

export const foodsByLocationRepository = {
  async listFoodsByLocation({ city, state, cityId, stateId }) {
    const location = { city, state, cityId, stateId };

    let vendorWhere = {
      active: true,
      suspended: false,
      deletedAt: null,
    };

    if (cityId && stateId) {
      const [resolvedCityId, resolvedStateId] = await Promise.all([
        resolveId(prisma.city, cityId),
        resolveId(prisma.state, stateId),
      ]);

      vendorWhere.cityId = resolvedCityId || "__missing__";
      vendorWhere.stateId = resolvedStateId || "__missing__";
    } else {
      const stateRecord = state
        ? await prisma.state.findFirst({
            where: {
              name: { equals: state.trim(), mode: "insensitive" },
              isActive: true,
            },
            select: { id: true },
          })
        : null;
      const cityRecord =
        stateRecord && city
          ? await prisma.city.findFirst({
              where: {
                name: { equals: city.trim(), mode: "insensitive" },
                stateId: stateRecord.id,
                isActive: true,
              },
              select: { id: true },
            })
          : null;

      vendorWhere = {
        ...vendorWhere,
        OR: [
          {
            AND: [
              {
                address: {
                  path: ["city"],
                  string_contains: city.trim(),
                },
              },
              {
                address: {
                  path: ["state"],
                  string_contains: state.trim(),
                },
              },
            ],
          },
          ...(stateRecord && cityRecord ? [{ stateId: stateRecord.id, cityId: cityRecord.id }] : []),
        ],
      };
    }

    const vendors = await prisma.vendor.findMany({
      where: vendorWhere,
      include: vendorInclude,
    });

    if (!vendors.length) {
      return {
        success: true,
        location,
        count: 0,
        foods: [],
        message: "No vendors found in this location.",
      };
    }

    const vendorIds = vendors.map((vendor) => vendor.id);

    const [items, combos] = await Promise.all([
      prisma.menuItem.findMany({
        where: {
          vendorId: { in: vendorIds },
          isAvailable: true,
          isInStock: true,
          isArchived: false,
        },
        include: {
          vendor: { include: vendorInclude },
          platformCategory: { include: categoryInclude },
          portions: {
            where: { isAvailable: true },
            orderBy: { price: "asc" },
          },
          choiceGroups: {
            orderBy: { sortOrder: "asc" },
          },
        },
      }),
      prisma.comboItem.findMany({
        where: {
          vendorId: { in: vendorIds },
          isAvailable: true,
          isInStock: true,
          isArchived: false,
        },
        include: {
          vendor: { include: vendorInclude },
          platformCategory: { include: categoryInclude },
        },
      }),
    ]);

    if (!items.length && !combos.length) {
      return {
        success: true,
        location,
        count: 0,
        foods: [],
        message: "No foods available in this location right now.",
      };
    }

    const foods = [...items.map(foodShape), ...combos.map(comboShape)];

    return {
      success: true,
      location,
      count: foods.length,
      foods,
    };
  },
};
