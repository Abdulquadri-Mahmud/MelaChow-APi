import express from "express";
import { 
    searchFoods,
    autocompleteFoods,
    getTrendingSearches,
    getSearchAnalytics
} from "../../controller/search/searchFood.controller.js";
import vendorAuth from "../../middleware/vendor.middleware.js";

const router = express.Router();

/**
 * @route GET /api/foods/search
 * @desc  search
 */
router.get("/search", searchFoods);
router.get("/autocomplete", autocompleteFoods);
router.get("/trending", getTrendingSearches);
router.get("/search-analytics", getSearchAnalytics);

export default router;
