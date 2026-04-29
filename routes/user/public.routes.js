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
import { getVendorForUserDisplay } from "../../controller/vendor/vendor.controller.js";
import { getVendorLocations, getLegacyVendorLocations } from "../../controller/user/getVendorLocations.controller.js";
import auth from "../../middleware/auth.middleware.js";
import optionalAuth from "../../middleware/optionalAuth.middleware.js";
import { getUserWallet, initiateWalletFunding, verifyWalletFunding } from "../../controller/user/wallet.controller.js";
import {
    getProfile, updateProfile,
    addAddress, getUserAddresses, updateAddress, deleteAddress
} from "../../controller/user/user.controller.js";
import { getPlatformConfig } from "../../services/platformConfig.service.js";

const router = express.Router();

/**
 * @description Get sanitized platform configuration for frontend (public-ish)
 * @route GET /api/user/platform-config
 * @access Public/Private
 */
router.get("/platform-config", async (req, res) => {
    try {
        const config = await getPlatformConfig();
        // Only expose customer-relevant fields
        res.status(200).json({
            success: true,
            data: {
                serviceFeeEnabled: config.serviceFeeEnabled,
                serviceFeeType: config.serviceFeeType,
                serviceFeeValue: config.serviceFeeValue,
                serviceFeeCap: config.serviceFeeCap
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @description Get foods filtered by city and state
 * @route GET /api/user/foods
 * @access Public
 */
// Locations first
router.get("/locations", getVendorLocations);
router.get("/locations/legacy", getLegacyVendorLocations);

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
 * @description Get vendor by ID or Slug
 * @route GET /api/user/vendors/:id
 * @access Public
 */
router.get("/vendors/:id", getVendorForUserDisplay);

/**
 * @description Get trending searches (location-aware if authenticated)
 * @route GET /api/user/trending
 * @access Public (with optional authentication for location filtering)
 */
router.get("/trending", optionalAuth, getTrendingSearch);

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
router.get("/my-wallet", auth, getUserWallet);
router.post("/wallet/fund", auth, initiateWalletFunding);
router.get("/wallet/verify/:reference", auth, verifyWalletFunding);

// Profile & Address Aliases (Cleaner URLs)
router.get("/profile", auth, getProfile);
router.patch("/profile", auth, updateProfile);
router.get("/address", auth, getUserAddresses); // or /my-address
router.post("/address", auth, addAddress);
router.patch("/address", auth, updateAddress);
router.delete("/address", auth, deleteAddress);

export default router;
