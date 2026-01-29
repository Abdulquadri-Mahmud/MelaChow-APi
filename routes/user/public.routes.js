import express from "express";
import { getFoodsByLocation } from "../../controller/user/getFoodsByLocation.controller.js";
import { getAllVendors } from "../../controller/user/getAllVendors.controller.js";
import { getNearbyVendorsForUser } from "../../controller/user/getNearbyVendors.controller.js";
import { getTrendingSearch } from "../../controller/user/getTrendingSearch.controller.js";
import {
    createReview,
    getVendorReviews,
    getUserReviews
} from "../../controller/user/user.reviews.controller.js";
import { getVendorLocations } from "../../controller/user/getVendorLocations.controller.js";
import auth from "../../middleware/auth.middleware.js";

const router = express.Router();

/**
 * @description Get foods filtered by city and state
 * @route GET /api/user/foods
 * @access Public
 */
// Locations first
router.get("/locations", getVendorLocations);

router.get("/foods", auth, getFoodsByLocation);

/**
 * @description Get all active vendors
 * @route GET /api/user/vendors
 * @access Public
 */
router.get("/vendors", getAllVendors);

/**
 * @description Get nearby vendors based on user's default address
 * @route GET /api/user/vendors/nearby
 * @access Private
 */
router.get("/vendors/nearby", auth, getNearbyVendorsForUser);

/**
 * @description Get trending searches
 * @route GET /api/user/trending
 * @access Public
 */
router.get("/trending", getTrendingSearch);

/**
 * @description Create a review (for food or restaurant)
 * @route POST /api/user/reviews
 * @access Private
 */
router.post("/reviews", auth, createReview);



/**
 * @description Get all reviews by the logged-in user
 * @route GET /api/user/my-reviews
 * @access Private
 */
router.get("/my-reviews", auth, getUserReviews);

export default router;
