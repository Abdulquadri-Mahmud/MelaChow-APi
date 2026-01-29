import express from "express";
import { 
  getRestaurantReviews,
  getFoodReviews,
  getRestaurantReviewsSummary
} from "../../controller/user/public.reviews.controller.js";

const router = express.Router();

// Get all reviews for a specific restaurant/vendor (Public)
router.get("/vendor/:vendorId", getRestaurantReviews);

// Get reviews summary for a restaurant (Public)
router.get("/vendor/:vendorId/summary", getRestaurantReviewsSummary);

// Get all reviews for a specific food item (Public)
router.get("/food/:foodId", getFoodReviews);

export default router;