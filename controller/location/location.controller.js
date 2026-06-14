import State from "../../model/location/State.js";
import City from "../../model/location/City.js";
import Vendor from "../../model/vendor/vendor.model.js";
import { toMongoCityShape, toMongoStateShape, usePostgresReads } from "../../services/postgres/compat.js";

/**
 * @desc Get all active states (available for selection)
 * @route GET /api/locations/states
 * @access Public
 */
export const getActiveStates = async (req, res) => {
    try {
        if (usePostgresReads()) {
            const { locationCategoryRepository } = await import("../../services/postgres/locationCategory.repository.js");
            const states = (await locationCategoryRepository.listActiveStates()).map(toMongoStateShape);

            return res.status(200).json({
                success: true,
                count: states.length,
                states,
            });
        }

        // Get all active states (not filtered by vendor presence)
        // This allows users to select states during registration/address setup
        const states = await State.find({
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
 * @desc Get all active cities for a state (available for selection)
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

        if (usePostgresReads()) {
            const { locationCategoryRepository } = await import("../../services/postgres/locationCategory.repository.js");
            const state = await locationCategoryRepository.getActiveStateById(stateId);

            if (!state) {
                return res.status(404).json({
                    success: false,
                    message: "State not found or inactive",
                });
            }

            const cities = (await locationCategoryRepository.listActiveCitiesByState(stateId)).map(toMongoCityShape);

            return res.status(200).json({
                success: true,
                count: cities.length,
                state: state.name,
                cities,
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

        // Get all active cities for this state
        const cities = await City.find({
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

/**
 * @desc Get all cities that have active and approved vendors
 * @route GET /api/locations/cities/with-vendors
 * @access Public
 */
export const getActiveCitiesWithVendors = async (req, res) => {
    try {
        // 1. Get distinct cityIds from active and approved vendors
        const cityIdsWithVendors = await Vendor.distinct("cityId", {
            active: true,
            verified: true,
        });

        // 2. Get active City documents matching those IDs
        const cities = await City.find({
            _id: { $in: cityIdsWithVendors },
            isActive: true,
        })
            .populate("stateId", "name")
            .sort({ name: 1 });

        res.status(200).json({
            success: true,
            count: cities.length,
            cities,
        });
    } catch (error) {
        console.error("Get Active Cities With Vendors Error:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching cities with vendors",
            error: error.message,
        });
    }
};
