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
            .populate("cityId", "name platformDeliveryFee")
            .select("storeName storeSlug storeDescription logo address fullAddress rating ratingCount cuisineTypes openingHours deliveryRadiusKm acceptsDelivery platformDeliveryFeeOverride")
            .sort({ rating: -1, createdAt: -1 })
            .lean();

        // 2. Resolve precise delivery fee for each vendor
        const vendorsWithFee = vendors.map(v => {
            let deliveryFee = 0;
            if (v.platformDeliveryFeeOverride != null && v.platformDeliveryFeeOverride > 0) {
                deliveryFee = v.platformDeliveryFeeOverride;
            } else {
                deliveryFee = v.cityId?.platformDeliveryFee || 0;
            }
            return {
                ...v,
                deliveryFee
            };
        });

        // 3. Format Response
        return res.json({
            success: true,
            count: vendorsWithFee.length,
            vendors: vendorsWithFee,
        });
    } catch (error) {
        console.error("GetAllVendors Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server Error",
        });
    }
};
