import prisma from "../../config/prisma.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

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

const compactObject = (value) =>
  Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined && fieldValue !== null));

const userShape = (user, fields) => {
  if (!user) return null;
  const shaped = { _id: legacyId(user) };
  for (const field of fields) shaped[field] = user[field];
  return compactObject(shaped);
};

const vendorShape = (vendor, fields, { includeVirtuals = false } = {}) => {
  if (!vendor) return null;
  const fullAddress = vendor.address
    ? [vendor.address.street, vendor.address.city, vendor.address.state, vendor.address.country].filter(Boolean).join(", ")
    : undefined;
  const shaped = { _id: legacyId(vendor) };
  if (includeVirtuals) shaped.id = legacyId(vendor);
  for (const field of fields) shaped[field] = vendor[field];
  if (includeVirtuals && fullAddress) shaped.fullAddress = fullAddress;
  return compactObject(shaped);
};

const foodShape = (food) =>
  food
    ? compactObject({
        _id: legacyId(food),
        name: food.name,
        image_url: food.imageUrl,
        rating: food.rating,
      })
    : null;

const reviewShape = (review, { userFields = [], vendorFields = [], includeUser = false, includeVendor = false, vendorVirtuals = false, foodMode = "object" } = {}) => ({
  _id: legacyId(review),
  userId: includeUser ? userShape(review.user, userFields) : review.user?.legacyMongoId || review.userId,
  vendorId: includeVendor ? vendorShape(review.vendor, vendorFields, { includeVirtuals: vendorVirtuals }) : review.vendor?.legacyMongoId || review.vendorId,
  foodId: foodMode === "object" ? foodShape(review.menuItem) : foodMode === "null" ? null : review.menuItem?.legacyMongoId || review.foodId || null,
  rating: review.rating,
  comment: review.comment,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
  __v: 0,
});

const reviewInclude = {
  user: {
    select: {
      id: true,
      legacyMongoId: true,
      firstname: true,
      lastname: true,
      email: true,
      phone: true,
    },
  },
  vendor: {
    select: {
      id: true,
      legacyMongoId: true,
      storeName: true,
      logo: true,
      email: true,
      phone: true,
      rating: true,
      ratingCount: true,
      openingHours: true,
      active: true,
      suspended: true,
      address: true,
    },
  },
  menuItem: {
    select: {
      id: true,
      legacyMongoId: true,
      name: true,
      imageUrl: true,
      rating: true,
    },
  },
};

const ratingDistributionFromRows = (reviews) => {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const review of reviews) {
    distribution[review.rating] = (distribution[review.rating] || 0) + 1;
  }
  return distribution;
};

const averageRatingFromDistribution = (distribution, total) =>
  total
    ? Object.entries(distribution).reduce((sum, [rating, count]) => sum + Number(rating || 0) * Number(count || 0), 0) / total
    : 0;

const buildAdminWhere = async ({ vendorId, rating, search } = {}) => {
  const where = {};

  if (vendorId) {
    const resolvedVendorId = await resolveId(prisma.vendor, vendorId);
    where.vendorId = resolvedVendorId || "__missing_vendor__";
  }

  if (rating && rating !== "all") where.rating = Number(rating);

  if (search) {
    const vendorRows = await prisma.vendor.findMany({
      where: {
        OR: [
          { storeName: { contains: String(search), mode: "insensitive" } },
          { email: { contains: String(search), mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });

    where.OR = [
      { comment: { contains: String(search), mode: "insensitive" } },
      ...(vendorRows.length ? [{ vendorId: { in: vendorRows.map((vendor) => vendor.id) } }] : []),
    ];
  }

  return where;
};

export const reviewManagementRepository = {
  async getUserReviews(userId) {
    const resolvedUserId = await resolveId(prisma.user, userId);
    if (!resolvedUserId) return [];

    const reviews = await prisma.review.findMany({
      where: { userId: resolvedUserId },
      include: reviewInclude,
      orderBy: { createdAt: "desc" },
    });

    return reviews.map((review) =>
      reviewShape(review, {
        includeVendor: true,
        vendorFields: ["storeName"],
        vendorVirtuals: true,
        foodMode: "null",
      })
    );
  },

  async getVendorReviews(vendorId) {
    const resolvedVendorId = await resolveId(prisma.vendor, vendorId);
    if (!resolvedVendorId) return [];

    const reviews = await prisma.review.findMany({
      where: { vendorId: resolvedVendorId },
      include: reviewInclude,
      orderBy: { createdAt: "desc" },
    });

    return reviews.map((review) =>
      reviewShape(review, {
        includeUser: true,
        userFields: ["firstname", "lastname", "email"],
        foodMode: "null",
      })
    );
  },

  async getAllVendorReviews({ vendorId, rating, search, page = 1, limit = 50 } = {}) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const skip = (safePage - 1) * safeLimit;
    const where = await buildAdminWhere({ vendorId, rating, search });

    const [reviews, total, allMatchingReviews] = await Promise.all([
      prisma.review.findMany({
        where,
        include: reviewInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: safeLimit,
      }),
      prisma.review.count({ where }),
      prisma.review.findMany({
        where,
        include: {
          vendor: {
            select: {
              id: true,
              legacyMongoId: true,
              storeName: true,
              logo: true,
            },
          },
        },
      }),
    ]);

    const ratingDistribution = ratingDistributionFromRows(allMatchingReviews);
    const averageRating = averageRatingFromDistribution(ratingDistribution, total);
    const vendorStatMap = new Map();

    for (const review of allMatchingReviews) {
      if (!review.vendor) continue;
      const id = legacyId(review.vendor);
      const current =
        vendorStatMap.get(id) ||
        {
          _id: id,
          count: 0,
          ratingTotal: 0,
          lowRatings: 0,
          storeName: review.vendor.storeName,
          logo: review.vendor.logo,
        };
      current.count += 1;
      current.ratingTotal += review.rating;
      if (review.rating <= 2) current.lowRatings += 1;
      vendorStatMap.set(id, current);
    }

    const vendorStats = vendorId
      ? []
      : [...vendorStatMap.values()]
      .map(({ ratingTotal, ...stat }) => ({
        ...stat,
        averageRating: stat.count ? ratingTotal / stat.count : 0,
      }))
      .sort((left, right) => right.lowRatings - left.lowRatings || right.count - left.count)
      .slice(0, 8);

    return {
      success: true,
      data: {
        reviews: reviews.map((review) =>
          reviewShape(review, {
            includeUser: true,
            includeVendor: true,
            userFields: ["firstname", "lastname", "email", "phone"],
            vendorFields: ["storeName", "logo", "email", "phone", "rating", "ratingCount", "openingHours", "active", "suspended"],
            foodMode: "null",
          })
        ),
        stats: {
          total,
          averageRating: Number(averageRating.toFixed(2)),
          lowRatingCount: (ratingDistribution[1] || 0) + (ratingDistribution[2] || 0),
          ratingDistribution,
          vendorStats,
          affectedVendorCount: vendorStatMap.size,
        },
        pagination: {
          total,
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil(total / safeLimit),
        },
      },
    };
  },
};
