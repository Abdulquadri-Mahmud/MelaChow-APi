import Reviews from "../../model/reviews/review.model.js";
import vendorModel from "../../model/vendor/vendor.model.js";
import Food from "../../model/vendor/food.model.js";

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
      const food = await Food.findById(foodId);
      if (!food) return res.status(404).json({ success: false, message: "Food not found" });
    }

    // Create review
    const review = await Reviews.create({ userId, vendorId, foodId, rating, comment });

    // Update Vendor Rating
    await vendor.updateRating(Number(rating));

    // Update Food Rating if foodId was provided
    if (foodId) {
      const food = await Food.findById(foodId);
      if (food) {
        await food.updateRating(Number(rating));
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

    const reviews = await Reviews
      .find({ userId })
      .populate("vendorId", "storeName")
      .populate("foodId", "name")
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

    const reviews = await Reviews
      .find({ vendorId })
      .populate("userId", "firstname lastname email")
      .populate("foodId", "name")
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
      const food = await Food.findById(review.foodId);
      if (food) {
        await food.removeRating(review.rating);
      }
    }

    await review.deleteOne();
    res.status(200).json({ success: true, message: "Review deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error deleting review", error: error.message });
  }
};
