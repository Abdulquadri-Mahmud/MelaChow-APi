import express from "express";

import { adminAuth } from "../../middleware/adminAuth.js";
import { 
  createReview,
  deleteReview,
  getUserReviews,
  getVendorReviews
} from "../../controller/user/user.reviews.controller.js";
import auth from "../../middleware/auth.middleware.js";

const router = express.Router();

// User creates a review
router.post("/create-reviews",auth, createReview);

// Admin gets reviews by a user
router.get("/user-reviews", adminAuth, getUserReviews);

// Public or admin gets reviews for a vendor
router.get("/vendor-reviews", adminAuth, getVendorReviews);

// Delete a review
router.delete("/reviews", adminAuth, deleteReview);

export default router;
