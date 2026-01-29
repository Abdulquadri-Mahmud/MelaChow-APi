import Vendor from "../../model/vendor/vendor.model.js";
import State from "../../model/location/State.js";
import City from "../../model/location/City.js";

/**
 * @desc Get list of unique states and cities where active vendors operate
 * @route GET /api/user/locations
 * @access Public
 * 
 * UPDATED: Now uses database-driven State/City models instead of raw strings
 */
export const getVendorLocations = async (req, res) => {
    try {
        // Find all approved vendors with valid stateId
        const vendorsWithStates = await Vendor.distinct("stateId", {
            verified: true,
            active: true,
            suspended: false,
            stateId: { $exists: true, $ne: null },
        });

        // Get active states that have approved vendors
        const states = await State.find({
            _id: { $in: vendorsWithStates },
            isActive: true,
        }).sort({ name: 1 });

        // For each state, get cities with approved vendors
        const locationsWithCities = await Promise.all(
            states.map(async (state) => {
                // Find cities in this state that have approved vendors
                const vendorsWithCities = await Vendor.distinct("cityId", {
                    stateId: state._id,
                    verified: true,
                    active: true,
                    suspended: false,
                    cityId: { $exists: true, $ne: null },
                });

                const cities = await City.find({
                    _id: { $in: vendorsWithCities },
                    stateId: state._id,
                    isActive: true,
                }).sort({ name: 1 });

                return {
                    state: state.name,
                    stateId: state._id,
                    cities: cities.map((city) => ({
                        name: city.name,
                        cityId: city._id,
                    })),
                };
            })
        );

        res.status(200).json({
            success: true,
            message: "Fetched vendor locations successfully",
            count: locationsWithCities.length,
            locations: locationsWithCities,
        });
    } catch (error) {
        console.error("Get Location Error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching locations",
            error: error.message,
        });
    }
};
