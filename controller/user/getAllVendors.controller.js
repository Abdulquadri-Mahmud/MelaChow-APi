import Vendor from "../../model/vendor/vendor.model.js";

/**
 * @desc    Get all active vendors
 * @route   GET /api/user/vendors
 * @access  Public
 */
export const getAllVendors = async (req, res) => {
    try {
        // 1. Fetch Active Vendors
        // We select public fields only for privacy/security
        // 1. Fetch Active Vendors
        // Removed kyc.verifiedAt check to allow unverified vendors (for dev/testing)
        const filter = {
            active: true,
            suspended: false
        };

        console.log("🔍 Fetching vendors with filters:", filter);

        const vendors = await Vendor.find(filter)
            .select("storeName storeSlug storeDescription logo address fullAddress rating ratingCount cuisineTypes openingHours deliveryRadiusKm acceptsDelivery")
            .sort({ rating: -1, createdAt: -1 }); // Prioritize higher rated & newer vendors

        // 2. Format Response
        return res.json({
            success: true,
            count: vendors.length,
            vendors,
        });
    } catch (error) {
        console.error("GetAllVendors Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server Error",
        });
    }
};
