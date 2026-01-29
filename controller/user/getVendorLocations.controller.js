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
        // Debug: Check if we have any vendors at all
        const totalVendors = await Vendor.countDocuments();
        const activeVendors = await Vendor.countDocuments({
            verified: true,
            active: true,
            suspended: false,
        });

        // Find all approved vendors with valid stateId
        const vendorsWithStates = await Vendor.distinct("stateId", {
            verified: true,
            active: true,
            suspended: false,
            stateId: { $exists: true, $ne: null },
        });

        // Debug: Check if we have any states in database
        const totalStates = await State.countDocuments();
        const activeStates = await State.countDocuments({ isActive: true });

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

        // If no locations found, provide fallback with debug info
        if (locationsWithCities.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No vendor locations found",
                count: 0,
                locations: [],
                debug: {
                    totalVendors,
                    activeVendors,
                    vendorsWithStateId: vendorsWithStates.length,
                    totalStates,
                    activeStates,
                    statesWithVendors: states.length,
                    note: "This might indicate vendors haven't been migrated to use stateId/cityId references yet"
                }
            });
        }

        res.status(200).json({
            success: true,
            message: "Fetched vendor locations successfully",
            count: locationsWithCities.length,
            locations: locationsWithCities,
            debug: {
                totalVendors,
                activeVendors,
                vendorsWithStateId: vendorsWithStates.length,
                totalStates,
                activeStates,
                statesWithVendors: states.length
            }
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

/**
 * @desc Get locations using legacy string-based addresses (fallback)
 * @route GET /api/user/locations/legacy
 * @access Public
 */
export const getLegacyVendorLocations = async (req, res) => {
    try {
        // Get unique states and cities from vendor address strings
        const vendors = await Vendor.find({
            verified: true,
            active: true,
            suspended: false,
            $or: [
                { "address.state": { $exists: true, $ne: "" } },
                { "address.city": { $exists: true, $ne: "" } }
            ]
        }).select("address.state address.city");

        // Group by state and collect unique cities
        const locationMap = {};
        
        vendors.forEach(vendor => {
            const state = vendor.address?.state?.trim();
            const city = vendor.address?.city?.trim();
            
            if (state) {
                if (!locationMap[state]) {
                    locationMap[state] = new Set();
                }
                if (city) {
                    locationMap[state].add(city);
                }
            }
        });

        // Convert to the expected format
        const locations = Object.keys(locationMap)
            .sort()
            .map(state => ({
                state,
                stateId: null, // Legacy format doesn't have IDs
                cities: Array.from(locationMap[state])
                    .sort()
                    .map(city => ({
                        name: city,
                        cityId: null // Legacy format doesn't have IDs
                    }))
            }));

        res.status(200).json({
            success: true,
            message: "Fetched legacy vendor locations successfully",
            count: locations.length,
            locations,
            note: "This is using legacy string-based addresses. Consider migrating to database-driven locations."
        });
    } catch (error) {
        console.error("Get Legacy Location Error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching legacy locations",
            error: error.message,
        });
    }
};