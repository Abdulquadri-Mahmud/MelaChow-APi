import express from "express";
import {
    searchFoods,
    autocompleteFoods,
    getTrendingSearches,
    getSearchAnalytics
} from "../../controller/search/searchFood.controller.js";
import vendorAuth from "../../middleware/vendor.middleware.js";
import optionalAuth from "../../middleware/optionalAuth.middleware.js";

const router = express.Router();

/**
 * @route GET /api/foods/search
 * @desc  Search foods (location-aware if authenticated)
 * @access Public (with optional authentication for location filtering)
 */
router.get("/search", optionalAuth, searchFoods);

/**
 * @route GET /api/foods/autocomplete
 * @desc  Autocomplete food search (location-aware if authenticated)
 * @access Public (with optional authentication for location filtering)
 */
router.get("/autocomplete", optionalAuth, autocompleteFoods);

/**
 * @route GET /api/foods/trending
 * @desc  Get trending searches
 * @access Public
 */
router.get("/trending", getTrendingSearches);

/**
 * @route GET /api/foods/search-analytics
 * @desc  Get search analytics
 * @access Private (Vendor)
 */
router.get("/search-analytics", getSearchAnalytics);

export default router;
