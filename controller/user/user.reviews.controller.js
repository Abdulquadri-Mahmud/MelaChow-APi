import Reviews from "../../model/reviews/review.model.js";
import "../../model/user.model.js";
import "../../model/vendor/food.model.js";
import "../../model/category.model.js";
import vendorModel from "../../model/vendor/vendor.model.js";
import MenuItem from "../../model/menu/MenuItem.js";
import { usePostgresReviewReads } from "../../services/postgres/compat.js";
import { reviewManagementRepository } from "../../services/postgres/reviewManagement.repository.js";

/**
 * @desc User creates a review for a vendor or food
 * @route POST /api/reviews
 * @access User
 */
export const createReview = async (req, res) => {
  try {
    const { vendorId, foodId, rating, comment } = req.body;

    const userId = req.userId

    // Validate required fields
    if (!userId || !vendorId || !rating)
      return res.status(400).json({ success: false, message: "userId, vendorId, and rating are required" });

    // Optional: check if vendor exists
    const vendor = await vendorModel.findById(vendorId);
    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });

    // Optional: check if food exists if foodId provided
    if (foodId) {
      const food = await MenuItem.findById(foodId);
      if (!food) return res.status(404).json({ success: false, message: "Food item not found" });
    }

    // Create review
    const review = await Reviews.create({ userId, vendorId, foodId, rating, comment });

    // Update Vendor Rating
    await vendor.updateRating(Number(rating));

    // Update Food Rating if foodId was provided
    if (foodId) {
      const menuItem = await MenuItem.findById(foodId);
      if (menuItem) {
        await menuItem.updateRating(Number(rating));
      }
    }

    res.status(201).json({
      success: true,
      message: "Review created successfully",
      review,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error creating review", error: error.message });
  }
};

/**
 * @desc Get all reviews by a user
 * @route GET /api/admin/user-reviews?userId=... (Admin)
 * @route GET /api/user/reviews (User - uses cookie)
 */
export const getUserReviews = async (req, res) => {
  try {
    let { userId } = req.query;

    // Use cookie-derived ID if no query param provided and user is authenticated
    if (!userId && req.userId) {
      userId = req.userId;
    }

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    if (usePostgresReviewReads()) {
      const reviews = await reviewManagementRepository.getUserReviews(userId);
      return res.status(200).json({
        success: true,
        total: reviews.length,
        reviews,
      });
    }

    const reviews = await Reviews
      .find({ userId })
      .populate("vendorId", "storeName")
      .populate("foodId", "name image_url rating")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      total: reviews.length,
      reviews,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching user reviews",
      error: error.message,
    });
  }
};

/**
 * @desc Get all reviews for a vendor (admin or public)
 * @route GET /api/vendor-reviews?vendorId=...
 */
export const getVendorReviews = async (req, res) => {
  try {
    let { vendorId } = req.query;

    // Use authenticated vendor ID if available and no query param provided
    if (!vendorId && req.vendor) {
      vendorId = req.vendor._id;
    }

    if (!vendorId) {
      return res.status(400).json({ success: false, message: "Vendor ID is required" });
    }

    if (usePostgresReviewReads()) {
      const reviews = await reviewManagementRepository.getVendorReviews(vendorId);
      return res.status(200).json({
        success: true,
        total: reviews.length,
        reviews,
      });
    }

    const reviews = await Reviews
      .find({ vendorId })
      .populate("userId", "firstname lastname email")
      .populate("foodId", "name image_url rating")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      total: reviews.length,
      reviews,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching vendor reviews",
      error: error.message,
    });
  }
};

/**
 * @desc Admin overview of all vendor reviews
 * @route GET /api/admin/user/reviews/vendor-reviews/all
 */
export const getAllVendorReviews = async (req, res) => {
  try {
    const {
      vendorId,
      rating,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    const filters = {};
    if (vendorId) filters.vendorId = vendorId;
    if (rating && rating !== "all") filters.rating = Number(rating);

    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const skip = (safePage - 1) * safeLimit;

    if (usePostgresReviewReads()) {
      const response = await reviewManagementRepository.getAllVendorReviews({
        vendorId,
        rating,
        search,
        page: safePage,
        limit: safeLimit,
      });
      return res.status(200).json(response);
    }

    let vendorIdsFromSearch = [];
    if (search) {
      const vendors = await vendorModel.find({
        $or: [
          { storeName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }).select("_id").lean();
      vendorIdsFromSearch = vendors.map((vendor) => vendor._id);

      filters.$or = [
        { comment: { $regex: search, $options: "i" } },
        ...(vendorIdsFromSearch.length ? [{ vendorId: { $in: vendorIdsFromSearch } }] : []),
      ];
    }

    const [reviews, total, ratingStats, vendorStats, affectedVendorIds] = await Promise.all([
      Reviews.find(filters)
        .populate("userId", "firstname lastname email phone")
        .populate("vendorId", "storeName logo email phone rating ratingCount openingHours active suspended")
        .populate("foodId", "name image_url rating")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      Reviews.countDocuments(filters),
      Reviews.aggregate([
        { $match: filters },
        { $group: { _id: "$rating", count: { $sum: 1 } } },
      ]),
      Reviews.aggregate([
        { $match: filters },
        {
          $group: {
            _id: "$vendorId",
            count: { $sum: 1 },
            averageRating: { $avg: "$rating" },
            lowRatings: {
              $sum: { $cond: [{ $lte: ["$rating", 2] }, 1, 0] },
            },
          },
        },
        { $sort: { lowRatings: -1, count: -1 } },
        { $limit: 8 },
        {
          $lookup: {
            from: "vendors",
            localField: "_id",
            foreignField: "_id",
            as: "vendor",
          },
        },
        { $unwind: "$vendor" },
        {
          $project: {
            count: 1,
            averageRating: 1,
            lowRatings: 1,
            storeName: "$vendor.storeName",
            logo: "$vendor.logo",
          },
        },
      ]),
      Reviews.distinct("vendorId", filters),
    ]);

    const ratingDistribution = ratingStats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });

    const averageRating = total
      ? ratingStats.reduce((sum, item) => sum + Number(item._id || 0) * Number(item.count || 0), 0) / total
      : 0;

    res.status(200).json({
      success: true,
      data: {
        reviews,
        stats: {
          total,
          averageRating: Number(averageRating.toFixed(2)),
          lowRatingCount: (ratingDistribution[1] || 0) + (ratingDistribution[2] || 0),
          ratingDistribution,
          vendorStats,
          affectedVendorCount: affectedVendorIds.length,
        },
        pagination: {
          total,
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil(total / safeLimit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching vendor reviews",
      error: error.message,
    });
  }
};

/**
 * @desc Delete a review (admin or user)
 * @route DELETE /api/reviews?reviewId=...
 */
export const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.query;
    const review = await Reviews.findById(reviewId);
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });

    // Update Vendor Rating (remove this review's contribution)
    const vendor = await vendorModel.findById(review.vendorId);
    if (vendor) {
      await vendor.removeRating(review.rating);
    }

    // Update Food Rating if foodId exists
    if (review.foodId) {
      const menuItem = await MenuItem.findById(review.foodId);
      if (menuItem) {
        await menuItem.removeRating(review.rating);
      }
    }

    await review.deleteOne();
    res.status(200).json({ success: true, message: "Review deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting review", error: error.message });
  }
};
