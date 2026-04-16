import Vendor from "../../model/vendor/vendor.model.js";
import City from "../../model/location/City.js";

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

        // Resolve IDs from State/City models (if possible)
        const StateModel = (await import("../../model/location/State.js")).default;
        const CityModel = (await import("../../model/location/City.js")).default;

        const stateDoc = await StateModel.findOne({ name: stateRegex, isActive: true });
        const cityDoc = stateDoc
            ? await CityModel.findOne({ name: cityRegex, stateId: stateDoc._id, isActive: true })
            : null;

        // Build Query: Match EITHER String Address OR ID Location
        const query = {
            active: true,
            suspended: false,
            deletedAt: null,
            $or: [
                { "address.city": cityRegex, "address.state": stateRegex },
                ...(stateDoc && cityDoc ? [{ stateId: stateDoc._id, cityId: cityDoc._id }] : [])
            ]
        };

        // 4. Find Active Vendors in that location
        const vendors = await Vendor.find(query)
            .select("storeName storeSlug storeDescription logo address fullAddress rating ratingCount cuisineTypes openingHours deliveryRadiusKm acceptsDelivery flatRateDeliveryFee platformDeliveryFeeOverride deliveryManagedBy")
            .sort({ rating: -1, createdAt: -1 })
            .lean();

        // 4.5 Resolve precise delivery fee for each vendor
        // Priority: Vendor Managed -> Platform Override -> City Level platformDeliveryFee
        const cityPlatformFee = cityDoc?.platformDeliveryFee || 0;
        const vendorsWithFee = vendors.map(v => {
            let deliveryFee = 0;
            if (v.deliveryManagedBy === "vendor") {
                deliveryFee = v.flatRateDeliveryFee || 0;
            } else if (v.platformDeliveryFeeOverride != null && v.platformDeliveryFeeOverride > 0) {
                deliveryFee = v.platformDeliveryFeeOverride;
            } else {
                deliveryFee = cityPlatformFee;
            }
            return {
                ...v,
                deliveryFee
            };
        });

        // 5. Response
        return res.json({
            success: true,
            userLocation: { city, state },
            count: vendorsWithFee.length,
            vendors: vendorsWithFee,
        });

    } catch (error) {
        console.error("GetNearbyVendorsForUser Error:", error);
        return res.status(500).json({
            success: false,
            message: "Server Error",
        });
    }
};
