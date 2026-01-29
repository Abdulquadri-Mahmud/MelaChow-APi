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
      .populate("userId", "firstname lastname")
      .populate("foodId", "name price images")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    // Get total count for pagination
    const totalReviews = await Reviews.countDocuments(query);

    // Calculate rating statistics
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

    // Format rating distribution
    const ratingDistribution = {
      5: 0, 4: 0, 3: 0, 2: 0, 1: 0
    };
    ratingStats.forEach(stat => {
      ratingDistribution[stat._id] = stat.count;
    });

    res.status(200).json({
      success: true,
      data: {
        restaurant: {
          id: vendor._id,
          name: vendor.storeName,
          averageRating: vendor.rating || 0,
          totalReviews: vendor.ratingCount || 0
        },
        reviews,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(totalReviews / limit),
          totalReviews,
          hasNext: page * limit < totalReviews,
          hasPrev: page > 1
        },
        ratingDistribution
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

    // Calculate rating statistics for this food
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

    // Format rating distribution
    const ratingDistribution = {
      5: 0, 4: 0, 3: 0, 2: 0, 1: 0
    };
    ratingStats.forEach(stat => {
      ratingDistribution[stat._id] = stat.count;
    });

    res.status(200).json({
      success: true,
      data: {
        food: {
          id: food._id,
          name: food.name,
          price: food.price,
          images: food.images,
          averageRating: food.rating || 0,
          totalReviews: food.ratingCount || 0,
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
        ratingDistribution
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

    // Get rating statistics
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

    const totalReviews = ratingStats.reduce((sum, stat) => sum + stat.count, 0);

    res.status(200).json({
      success: true,
      data: {
        restaurant: {
          id: vendor._id,
          name: vendor.storeName,
          averageRating: vendor.rating || 0,
          totalReviews: vendor.ratingCount || totalReviews
        },
        ratingDistribution,
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