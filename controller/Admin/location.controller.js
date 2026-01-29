import State from "../../model/location/State.js";
import City from "../../model/location/City.js";
import Vendor from "../../model/vendor/vendor.model.js";

/**
 * @desc Create a new state
 * @route POST /api/admin/locations/states
 * @access Admin only
 */
export const createState = async (req, res) => {
    try {
        const { name } = req.body;

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "State name is required",
            });
        }

        // Check if state already exists
        const existingState = await State.findOne({
            name: name.trim(),
        });

        if (existingState) {
            return res.status(409).json({
                success: false,
                message: "State already exists",
                state: existingState,
            });
        }

        const state = await State.create({
            name: name.trim(),
            isActive: true,
        });

        res.status(201).json({
            success: true,
            message: "State created successfully",
            state,
        });
    } catch (error) {
        console.error("Create State Error:", error);
        res.status(500).json({
            success: false,
            message: "Error creating state",
            error: error.message,
        });
    }
};

/**
 * @desc Create a new city under a state
 * @route POST /api/admin/locations/cities
 * @access Admin only
 */
export const createCity = async (req, res) => {
    try {
        const { name, stateId } = req.body;

        if (!name || !name.trim() || !stateId) {
            return res.status(400).json({
                success: false,
                message: "City name and stateId are required",
            });
        }

        // Verify state exists
        const state = await State.findById(stateId);
        if (!state) {
            return res.status(404).json({
                success: false,
                message: "State not found",
            });
        }

        // Check if city already exists in this state
        const existingCity = await City.findOne({
            name: name.trim(),
            stateId,
        });

        if (existingCity) {
            return res.status(409).json({
                success: false,
                message: "City already exists in this state",
                city: existingCity,
            });
        }

        const city = await City.create({
            name: name.trim(),
            stateId,
            isActive: true,
        });

        // Populate state info
        await city.populate("stateId", "name");

        res.status(201).json({
            success: true,
            message: "City created successfully",
            city,
        });
    } catch (error) {
        console.error("Create City Error:", error);
        res.status(500).json({
            success: false,
            message: "Error creating city",
            error: error.message,
        });
    }
};

/**
 * @desc Activate/Deactivate a state
 * @route PATCH /api/admin/locations/states/:id/activate
 * @access Admin only
 */
export const toggleStateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "isActive must be a boolean",
            });
        }

        const state = await State.findByIdAndUpdate(
            id,
            { isActive },
            { new: true }
        );

        if (!state) {
            return res.status(404).json({
                success: false,
                message: "State not found",
            });
        }

        res.status(200).json({
            success: true,
            message: `State ${isActive ? "activated" : "deactivated"} successfully`,
            state,
        });
    } catch (error) {
        console.error("Toggle State Status Error:", error);
        res.status(500).json({
            success: false,
            message: "Error updating state status",
            error: error.message,
        });
    }
};

/**
 * @desc Activate/Deactivate a city
 * @route PATCH /api/admin/locations/cities/:id/activate
 * @access Admin only
 */
export const toggleCityStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (typeof isActive !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "isActive must be a boolean",
            });
        }

        const city = await City.findByIdAndUpdate(
            id,
            { isActive },
            { new: true }
        ).populate("stateId", "name");

        if (!city) {
            return res.status(404).json({
                success: false,
                message: "City not found",
            });
        }

        res.status(200).json({
            success: true,
            message: `City ${isActive ? "activated" : "deactivated"} successfully`,
            city,
        });
    } catch (error) {
        console.error("Toggle City Status Error:", error);
        res.status(500).json({
            success: false,
            message: "Error updating city status",
            error: error.message,
        });
    }
};

/**
 * @desc Get all vendors with pending location requests
 * @route GET /api/admin/locations/location-requests
 * @access Admin only
 */
export const getLocationRequests = async (req, res) => {
    try {
        const vendors = await Vendor.find({
            locationStatus: "pending_review",
        })
            .select(
                "storeName name email phone requestedState requestedCity address createdAt"
            )
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: vendors.length,
            vendors,
        });
    } catch (error) {
        console.error("Get Location Requests Error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching location requests",
            error: error.message,
        });
    }
};

/**
 * @desc Get all states (admin view - includes inactive)
 * @route GET /api/admin/locations/states
 * @access Admin only
 */
export const getAllStates = async (req, res) => {
    try {
        const states = await State.find().sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: states.length,
            states,
        });
    } catch (error) {
        console.error("Get All States Error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching states",
            error: error.message,
        });
    }
};

/**
 * @desc Get all cities for a state (admin view - includes inactive)
 * @route GET /api/admin/locations/cities?stateId=...
 * @access Admin only
 */
export const getAllCities = async (req, res) => {
    try {
        const { stateId } = req.query;

        const query = stateId ? { stateId } : {};
        const cities = await City.find(query)
            .populate("stateId", "name")
            .sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: cities.length,
            cities,
        });
    } catch (error) {
        console.error("Get All Cities Error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching cities",
            error: error.message,
        });
    }
};
