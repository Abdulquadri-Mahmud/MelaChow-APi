import express from "express";
import { getRecommendations } from "../../controller/recommendation/recommendation.controller.js";
import optionalAuth from "../../middleware/optionalAuth.middleware.js";

const router = express.Router();

/**
 * @route   GET /api/recommendations
 * @desc    Get personalized food recommendations
 * @access  Public (Optional Auth for location context)
 */
router.get("/", optionalAuth, getRecommendations);

export default router;
