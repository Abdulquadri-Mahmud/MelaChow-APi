import prisma from "../../config/prisma.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const legacyId = (record) => record?.legacyMongoId || record?.id || null;

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

const emptyRatingDistribution = () => ({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });

const calculateRatingStats = (reviews) => {
  const ratingDistribution = emptyRatingDistribution();
  let totalRatingPoints = 0;

  for (const review of reviews) {
    ratingDistribution[review.rating] = (ratingDistribution[review.rating] || 0) + 1;
    totalRatingPoints += review.rating;
  }

  const totalReviews = reviews.length;
  const averageRating = totalReviews ? Math.round((totalRatingPoints / totalReviews) * 10) / 10 : 0;
  const ratingPercentages = {};
  Object.keys(ratingDistribution).forEach((rating) => {
    ratingPercentages[rating] = totalReviews ? Math.round((ratingDistribution[rating] / totalReviews) * 100) : 0;
  });

  return {
    ratingDistribution,
    ratingPercentages,
    totalReviews,
    totalRatingPoints,
    averageRating,
  };
};

const categoryShape = (category) =>
  category
    ? {
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
      }
    : null;

const userShape = (user, fields = ["firstname", "lastname", "avatar"]) => {
  if (!user) return null;
  const shaped = { _id: legacyId(user) };
  for (const field of fields) {
    if (user[field] !== undefined && user[field] !== null) shaped[field] = user[field];
  }
  return shaped;
};

const vendorShape = (vendor, fields = ["storeName"]) => {
  if (!vendor) return null;
  const fullAddress = vendor.address
    ? [vendor.address.street, vendor.address.city, vendor.address.state, vendor.address.country].filter(Boolean).join(", ")
    : undefined;
  const shaped = { _id: legacyId(vendor), id: legacyId(vendor) };
  for (const field of fields) shaped[field] = vendor[field];
  if (fullAddress) shaped.fullAddress = fullAddress;
  return shaped;
};

const foodShape = (food) =>
  food
    ? {
        _id: legacyId(food),
        name: food.name,
        image_url: food.imageUrl,
        rating: food.rating,
      }
    : null;

const reviewShape = (review, { userFields = ["firstname", "lastname", "avatar"], includeVendor = false, foodMode = "raw" } = {}) => ({
  _id: legacyId(review),
  userId: userShape(review.user, userFields),
  vendorId: includeVendor ? vendorShape(review.vendor) : legacyId(review.vendor),
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
      avatar: true,
      email: true,
    },
  },
  vendor: {
    select: {
      id: true,
      legacyMongoId: true,
      storeName: true,
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

const foodInclude = {
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
      parent: true,
    },
  },
  portions: {
    orderBy: { price: "asc" },
    take: 1,
  },
};

export const publicReviewsRepository = {
  async getRestaurantReviews(vendorId, { page = 1, limit = 10, rating } = {}) {
    const resolvedVendorId = await resolveId(prisma.vendor, vendorId);
    if (!resolvedVendorId) return null;

    const vendor = await prisma.vendor.findUnique({ where: { id: resolvedVendorId } });
    if (!vendor) return null;

    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.max(Number(limit) || 10, 1);
    const skip = (pageNum - 1) * limitNum;
    const where = {
      vendorId: resolvedVendorId,
      ...(rating ? { rating: Number(rating) } : {}),
    };
    const statsWhere = { vendorId: resolvedVendorId };

    const [reviews, totalReviews, allReviewsForStats] = await Promise.all([
      prisma.review.findMany({
        where,
        include: reviewInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.review.count({ where }),
      prisma.review.findMany({
        where: statsWhere,
        select: { rating: true },
      }),
    ]);

    const stats = calculateRatingStats(allReviewsForStats);
    const accurateAverageRating = stats.totalReviews ? stats.averageRating : vendor.rating || 0;
    const accurateTotalReviews = stats.totalReviews || vendor.ratingCount || 0;

    return {
      success: true,
      data: {
        restaurant: {
          id: legacyId(vendor),
          name: vendor.storeName,
          averageRating: accurateAverageRating,
          totalReviews: accurateTotalReviews,
          storedRating: vendor.rating || 0,
          storedReviewCount: vendor.ratingCount || 0,
        },
        reviews: reviews.map((review) => reviewShape(review, { foodMode: "null" })),
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalReviews / limitNum),
          totalReviews,
          hasNext: pageNum * limitNum < totalReviews,
          hasPrev: pageNum > 1,
        },
        ratingDistribution: stats.ratingDistribution,
        ratingPercentages: stats.ratingPercentages,
        ratingBreakdown: {
          totalRatingPoints: stats.totalRatingPoints,
          averageCalculation: stats.totalReviews
            ? `${stats.totalRatingPoints} ÷ ${stats.totalReviews} = ${accurateAverageRating}`
            : "No reviews yet",
        },
      },
    };
  },

  async getFoodReviews(foodId, { page = 1, limit = 10, rating } = {}) {
    const resolvedFoodId = await resolveId(prisma.menuItem, foodId);
    if (!resolvedFoodId) return null;

    const food = await prisma.menuItem.findUnique({
      where: { id: resolvedFoodId },
      include: foodInclude,
    });
    if (!food) return null;

    const pageNum = Math.max(Number(page) || 1, 1);
    const limitNum = Math.max(Number(limit) || 10, 1);
    const skip = (pageNum - 1) * limitNum;
    const where = {
      foodId: resolvedFoodId,
      ...(rating ? { rating: Number(rating) } : {}),
    };
    const statsWhere = { foodId: resolvedFoodId };

    const [reviews, totalReviews, allReviewsForStats] = await Promise.all([
      prisma.review.findMany({
        where,
        include: reviewInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.review.count({ where }),
      prisma.review.findMany({
        where: statsWhere,
        select: { rating: true },
      }),
    ]);

    const stats = calculateRatingStats(allReviewsForStats);
    const cheapestPortion = food.portions?.[0];
    const deliveryFeeKobo =
      food.vendor?.platformDeliveryFeeOverride && food.vendor.platformDeliveryFeeOverride > 0
        ? food.vendor.platformDeliveryFeeOverride
        : food.vendor?.city?.platformDeliveryFee || 0;
    const accurateAverageRating = stats.totalReviews ? stats.averageRating : food.rating || 0;
    const accurateTotalReviews = stats.totalReviews || food.ratingCount || 0;

    return {
      success: true,
      data: {
        food: {
          id: legacyId(food),
          name: food.name,
          price_naira: cheapestPortion ? cheapestPortion.price / 100 : null,
          portion_label: cheapestPortion?.label ?? null,
          image: food.imageUrl || "",
          deliveryFee: deliveryFeeKobo,
          platform_category: categoryShape(food.platformCategory),
          averageRating: accurateAverageRating,
          totalReviews: accurateTotalReviews,
          storedRating: food.rating || 0,
          storedReviewCount: food.ratingCount || 0,
          restaurant: {
            id: legacyId(food.vendor),
            name: food.vendor?.storeName,
          },
        },
        reviews: reviews.map((review) => reviewShape(review, { includeVendor: true })),
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalReviews / limitNum),
          totalReviews,
          hasNext: pageNum * limitNum < totalReviews,
          hasPrev: pageNum > 1,
        },
        ratingDistribution: stats.ratingDistribution,
        ratingPercentages: stats.ratingPercentages,
        ratingBreakdown: {
          totalRatingPoints: stats.totalRatingPoints,
          averageCalculation: stats.totalReviews
            ? `${stats.totalRatingPoints} ÷ ${stats.totalReviews} = ${accurateAverageRating}`
            : "No reviews yet",
        },
      },
    };
  },

  async getRestaurantReviewsSummary(vendorId) {
    const resolvedVendorId = await resolveId(prisma.vendor, vendorId);
    if (!resolvedVendorId) return null;

    const vendor = await prisma.vendor.findUnique({ where: { id: resolvedVendorId } });
    if (!vendor) return null;

    const [allReviewsForStats, recentReviews] = await Promise.all([
      prisma.review.findMany({
        where: { vendorId: resolvedVendorId },
        select: { rating: true },
      }),
      prisma.review.findMany({
        where: { vendorId: resolvedVendorId },
        include: reviewInclude,
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    const stats = calculateRatingStats(allReviewsForStats);
    const accurateAverageRating = stats.totalReviews ? stats.averageRating : vendor.rating || 0;
    const accurateTotalReviews = stats.totalReviews || vendor.ratingCount || 0;

    return {
      success: true,
      data: {
        restaurant: {
          id: legacyId(vendor),
          name: vendor.storeName,
          averageRating: accurateAverageRating,
          totalReviews: accurateTotalReviews,
          storedRating: vendor.rating || 0,
          storedReviewCount: vendor.ratingCount || 0,
        },
        ratingDistribution: stats.ratingDistribution,
        ratingPercentages: stats.ratingPercentages,
        ratingBreakdown: {
          totalRatingPoints: stats.totalRatingPoints,
          averageCalculation: stats.totalReviews
            ? `${stats.totalRatingPoints} ÷ ${stats.totalReviews} = ${accurateAverageRating}`
            : "No reviews yet",
          ratingDetails: Object.entries(stats.ratingDistribution)
            .filter(([, count]) => count > 0)
            .map(([stars, count]) => ({
              stars: Number(stars),
              count,
              percentage: stats.totalReviews ? Math.round((count / stats.totalReviews) * 100) : 0,
            }))
            .sort((left, right) => right.stars - left.stars),
        },
        recentReviews: recentReviews.map((review) => reviewShape(review, { foodMode: "null" })),
      },
    };
  },
};
