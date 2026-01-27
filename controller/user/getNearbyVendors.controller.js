import User from "../../model/user.model.js";
import Vendor from "../../model/vendor/vendor.model.js";

/**
 * @desc    Get all vendors near the logged-in user
 * @route   GET /api/user/vendors/nearby
 * @access  Private (User)
 */
export const getNearbyVendorsForUser = async (req, res) => {
    try {
        const userId = req.userId; // From auth middleware

        // 1. Get User Profile to find their location
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // 2. Identify Target Location
        // Priority: Default Address -> First Address -> Returns error if none
        const defaultAddress = user.addresses.find((addr) => addr.isDefault) || user.addresses[0];

        if (!defaultAddress || !defaultAddress.city || !defaultAddress.state) {
            return res.status(400).json({
                success: false,
                message: "Please add a valid address with City and State to your profile to find nearby vendors."
            });
        }

        const { city, state } = defaultAddress;
        console.log(`📍 Fetching vendors for User ${userId} in ${city}, ${state}`);

        // 3. Normalize for Search (Relaxed regex to handle whitespace in DB)
        const cityRegex = new RegExp(`^\\s*${city.trim()}\\s*$`, "i");
        const stateRegex = new RegExp(`^\\s*${state.trim()}\\s*$`, "i");

        // 4. Find Active Vendors in that location
        const vendors = await Vendor.find({
            active: true,
            suspended: false,
            deletedAt: null, // Ensure they are not soft-deleted
            "address.city": cityRegex,
            "address.state": stateRegex
        })
            .select("storeName storeSlug storeDescription logo address fullAddress rating ratingCount cuisineTypes openingHours deliveryRadiusKm acceptsDelivery")
            .sort({ rating: -1, createdAt: -1 });

        // 5. Response
        return res.json({
            success: true,
            userLocation: { city, state },
            count: vendors.length,
            vendors,
        });

    } catch (error) {
        console.error("GetNearbyVendorsForUser Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server Error",
        });
    }
};
