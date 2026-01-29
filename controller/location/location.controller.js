import State from "../../model/location/State.js";
import City from "../../model/location/City.js";
import Vendor from "../../model/vendor/vendor.model.js";

/**
 * @desc Get all active states that have at least one approved restaurant
 * @route GET /api/locations/states
 * @access Public
 */
export const getActiveStates = async (req, res) => {
    try {
        // Find all approved vendors with valid stateId
        const vendorsWithStates = await Vendor.distinct("stateId", {
            verified: true,
            active: true,
            suspended: false,
            stateId: { $exists: true, $ne: null },
        });

        // Get only states that are active AND have approved vendors
        const states = await State.find({
            _id: { $in: vendorsWithStates },
            isActive: true,
        }).sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: states.length,
            states,
        });
    } catch (error) {
        console.error("Get Active States Error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching states",
            error: error.message,
        });
    }
};

/**
 * @desc Get all active cities for a state that have at least one approved restaurant
 * @route GET /api/locations/cities?stateId=...
 * @access Public
 */
export const getActiveCities = async (req, res) => {
    try {
        const { stateId } = req.query;

        if (!stateId) {
            return res.status(400).json({
                success: false,
                message: "stateId is required",
            });
        }

        // Verify state exists and is active
        const state = await State.findOne({ _id: stateId, isActive: true });
        if (!state) {
            return res.status(404).json({
                success: false,
                message: "State not found or inactive",
            });
        }

        // Find all approved vendors in this state with valid cityId
        const vendorsWithCities = await Vendor.distinct("cityId", {
            stateId,
            verified: true,
            active: true,
            suspended: false,
            cityId: { $exists: true, $ne: null },
        });

        // Get only cities that are active AND have approved vendors
        const cities = await City.find({
            _id: { $in: vendorsWithCities },
            stateId,
            isActive: true,
        })
            .populate("stateId", "name")
            .sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: cities.length,
            state: state.name,
            cities,
        });
    } catch (error) {
        console.error("Get Active Cities Error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching cities",
            error: error.message,
        });
    }
};
