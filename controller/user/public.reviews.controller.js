import Reviews from "../../model/reviews/review.model.js";
import vendorModel from "../../model/vendor/vendor.model.js";
import Food from "../../model/vendor/food.model.js";

/**
 * @desc Get all reviews for a specific restaurant/vendor (Public)
 * @route GET /api/public/reviews/vendor/:vendorId
 * @access Public
 */
export const getRestaurantReviews = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { page = 1, limit = 10, rating } = req.query;

    if (!vendorId) {
      return res.status(400).json({ 
        success: false, 
        message: "Vendor ID is required" 
      });
    }

    // Check if vendor exists
    const vendor = await vendorModel.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ 
        success: false, 
        message: "Restaurant not found" 
      });
    }

    // Build query
    let query = { vendorId };
    if (rating) {
      query.rating = Number(rating);
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get reviews with pagination
    const reviews = await Reviews
      .find(query)
      .populate("userId", "firstname lastname avatar")
      .populate("foodId", "name price images")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    // Get total count for pagination
    const totalReviews = await Reviews.countDocuments(query);

    // Calculate accurate rating statistics from actual reviews
    const ratingStats = await Reviews.aggregate([
      { $match: { vendorId: vendor._id } },
      {
        $group: {
          _id: "$rating",
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    // Calculate real-time overall rating
    const overallRatingCalc = await Reviews.aggregate([
      { $match: { vendorId: vendor._id } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
          totalRatingPoints: { $sum: "$rating" }
        }
      }
    ]);

    // Format rating distribution
    const ratingDistribution = {
      5: 0, 4: 0, 3: 0, 2: 0, 1: 0
    };
    ratingStats.forEach(stat => {
      ratingDistribution[stat._id] = stat.count;
    });

    // Calculate percentage distribution
    const totalActualReviews = ratingStats.reduce((sum, stat) => sum + stat.count, 0);
    const ratingPercentages = {};
    Object.keys(ratingDistribution).forEach(rating => {
      ratingPercentages[rating] = totalActualReviews > 0 
        ? Math.round((ratingDistribution[rating] / totalActualReviews) * 100) 
        : 0;
    });

    // Use calculated values or fallback to stored values
    const calculatedRating = overallRatingCalc.length > 0 ? overallRatingCalc[0] : null;
    const accurateAverageRating = calculatedRating 
      ? Math.round(calculatedRating.averageRating * 10) / 10 
      : vendor.rating || 0;
    const accurateTotalReviews = calculatedRating 
      ? calculatedRating.totalReviews 
      : vendor.ratingCount || 0;

    res.status(200).json({
      success: true,
      data: {
        restaurant: {
          id: vendor._id,
          name: vendor.storeName,
          averageRating: accurateAverageRating,
          totalReviews: accurateTotalReviews,
          storedRating: vendor.rating || 0, // For comparison/debugging
          storedReviewCount: vendor.ratingCount || 0 // For comparison/debugging
        },
        reviews,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(totalReviews / limit),
          totalReviews,
          hasNext: page * limit < totalReviews,
          hasPrev: page > 1
        },
        ratingDistribution,
        ratingPercentages,
        ratingBreakdown: {
          totalRatingPoints: calculatedRating ? calculatedRating.totalRatingPoints : 0,
          averageCalculation: calculatedRating 
            ? `${calculatedRating.totalRatingPoints} ÷ ${calculatedRating.totalReviews} = ${accurateAverageRating}`
            : "No reviews yet"
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching restaurant reviews",
      error: error.message,
    });
  }
};

/**
 * @desc Get all reviews for a specific food item (Public)
 * @route GET /api/public/reviews/food/:foodId
 * @access Public
 */
export const getFoodReviews = async (req, res) => {
  try {
    const { foodId } = req.params;
    const { page = 1, limit = 10, rating } = req.query;

    if (!foodId) {
      return res.status(400).json({ 
        success: false, 
        message: "Food ID is required" 
      });
    }

    // Check if food exists
    const food = await Food.findById(foodId).populate("vendor", "storeName");
    if (!food) {
      return res.status(404).json({ 
        success: false, 
        message: "Food item not found" 
      });
    }

    // Build query
    let query = { foodId };
    if (rating) {
      query.rating = Number(rating);
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get reviews with pagination
    const reviews = await Reviews
      .find(query)
      .populate("userId", "firstname lastname")
      .populate("vendorId", "storeName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    // Get total count for pagination
    const totalReviews = await Reviews.countDocuments(query);

    // Calculate accurate rating statistics for this food
    const ratingStats = await Reviews.aggregate([
      { $match: { foodId: food._id } },
      {
        $group: {
          _id: "$rating",
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    // Calculate real-time overall rating for food
    const overallRatingCalc = await Reviews.aggregate([
      { $match: { foodId: food._id } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
          totalRatingPoints: { $sum: "$rating" }
        }
      }
    ]);

    // Format rating distribution
    const ratingDistribution = {
      5: 0, 4: 0, 3: 0, 2: 0, 1: 0
    };
    ratingStats.forEach(stat => {
      ratingDistribution[stat._id] = stat.count;
    });

    // Calculate percentage distribution
    const totalActualReviews = ratingStats.reduce((sum, stat) => sum + stat.count, 0);
    const ratingPercentages = {};
    Object.keys(ratingDistribution).forEach(rating => {
      ratingPercentages[rating] = totalActualReviews > 0 
        ? Math.round((ratingDistribution[rating] / totalActualReviews) * 100) 
        : 0;
    });

    // Use calculated values or fallback to stored values
    const calculatedRating = overallRatingCalc.length > 0 ? overallRatingCalc[0] : null;
    const accurateAverageRating = calculatedRating 
      ? Math.round(calculatedRating.averageRating * 10) / 10 
      : food.rating || 0;
    const accurateTotalReviews = calculatedRating 
      ? calculatedRating.totalReviews 
      : food.ratingCount || 0;

    res.status(200).json({
      success: true,
      data: {
        food: {
          id: food._id,
          name: food.name,
          price: food.price,
          images: food.images,
          averageRating: accurateAverageRating,
          totalReviews: accurateTotalReviews,
          storedRating: food.rating || 0, // For comparison/debugging
          storedReviewCount: food.ratingCount || 0, // For comparison/debugging
          restaurant: {
            id: food.vendor._id,
            name: food.vendor.storeName
          }
        },
        reviews,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(totalReviews / limit),
          totalReviews,
          hasNext: page * limit < totalReviews,
          hasPrev: page > 1
        },
        ratingDistribution,
        ratingPercentages,
        ratingBreakdown: {
          totalRatingPoints: calculatedRating ? calculatedRating.totalRatingPoints : 0,
          averageCalculation: calculatedRating 
            ? `${calculatedRating.totalRatingPoints} ÷ ${calculatedRating.totalReviews} = ${accurateAverageRating}`
            : "No reviews yet"
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching food reviews",
      error: error.message,
    });
  }
};

/**
 * @desc Get reviews summary for a restaurant (Public)
 * @route GET /api/public/reviews/vendor/:vendorId/summary
 * @access Public
 */
export const getRestaurantReviewsSummary = async (req, res) => {
  try {
    const { vendorId } = req.params;

    if (!vendorId) {
      return res.status(400).json({ 
        success: false, 
        message: "Vendor ID is required" 
      });
    }

    // Check if vendor exists
    const vendor = await vendorModel.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({ 
        success: false, 
        message: "Restaurant not found" 
      });
    }

    // Get accurate rating statistics
    const ratingStats = await Reviews.aggregate([
      { $match: { vendorId: vendor._id } },
      {
        $group: {
          _id: "$rating",
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    // Calculate real-time overall rating
    const overallRatingCalc = await Reviews.aggregate([
      { $match: { vendorId: vendor._id } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
          totalRatingPoints: { $sum: "$rating" }
        }
      }
    ]);

    // Get recent reviews (last 5)
    const recentReviews = await Reviews
      .find({ vendorId })
      .populate("userId", "firstname lastname")
      .populate("foodId", "name")
      .sort({ createdAt: -1 })
      .limit(5);

    // Format rating distribution
    const ratingDistribution = {
      5: 0, 4: 0, 3: 0, 2: 0, 1: 0
    };
    ratingStats.forEach(stat => {
      ratingDistribution[stat._id] = stat.count;
    });

    // Calculate percentage distribution
    const totalActualReviews = ratingStats.reduce((sum, stat) => sum + stat.count, 0);
    const ratingPercentages = {};
    Object.keys(ratingDistribution).forEach(rating => {
      ratingPercentages[rating] = totalActualReviews > 0 
        ? Math.round((ratingDistribution[rating] / totalActualReviews) * 100) 
        : 0;
    });

    // Use calculated values or fallback to stored values
    const calculatedRating = overallRatingCalc.length > 0 ? overallRatingCalc[0] : null;
    const accurateAverageRating = calculatedRating 
      ? Math.round(calculatedRating.averageRating * 10) / 10 
      : vendor.rating || 0;
    const accurateTotalReviews = calculatedRating 
      ? calculatedRating.totalReviews 
      : vendor.ratingCount || 0;

    res.status(200).json({
      success: true,
      data: {
        restaurant: {
          id: vendor._id,
          name: vendor.storeName,
          averageRating: accurateAverageRating,
          totalReviews: accurateTotalReviews,
          storedRating: vendor.rating || 0, // For comparison/debugging
          storedReviewCount: vendor.ratingCount || 0 // For comparison/debugging
        },
        ratingDistribution,
        ratingPercentages,
        ratingBreakdown: {
          totalRatingPoints: calculatedRating ? calculatedRating.totalRatingPoints : 0,
          averageCalculation: calculatedRating 
            ? `${calculatedRating.totalRatingPoints} ÷ ${calculatedRating.totalReviews} = ${accurateAverageRating}`
            : "No reviews yet",
          ratingDetails: ratingStats.map(stat => ({
            stars: stat._id,
            count: stat.count,
            percentage: totalActualReviews > 0 ? Math.round((stat.count / totalActualReviews) * 100) : 0
          }))
        },
        recentReviews
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching restaurant reviews summary",
      error: error.message,
    });
  }
};