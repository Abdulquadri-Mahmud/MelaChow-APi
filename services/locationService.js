import State from "../model/location/State.js";
import City from "../model/location/City.js";

/**
 * Validates and resolves vendor location during registration
 * 
 * @param {string} stateName - State name provided by vendor
 * @param {string} cityName - City name provided by vendor
 * @returns {Object} - { stateId, cityId, locationStatus, requestedState, requestedCity }
 */
export const validateVendorLocation = async (stateName, cityName) => {
    try {
        // Normalize inputs
        const normalizedState = stateName?.trim();
        const normalizedCity = cityName?.trim();

        if (!normalizedState || !normalizedCity) {
            throw new Error("State and city are required");
        }

        // Check if state exists in database
        const state = await State.findOne({
            name: { $regex: new RegExp(`^${normalizedState}$`, "i") },
            isActive: true,
        });

        if (!state) {
            // State doesn't exist - flag for admin review
            return {
                stateId: null,
                cityId: null,
                locationStatus: "pending_review",
                requestedState: normalizedState,
                requestedCity: normalizedCity,
            };
        }

        // State exists - check if city exists under this state
        const city = await City.findOne({
            name: { $regex: new RegExp(`^${normalizedCity}$`, "i") },
            stateId: state._id,
            isActive: true,
        });

        if (!city) {
            // City doesn't exist in this state - flag for admin review
            return {
                stateId: null,
                cityId: null,
                locationStatus: "pending_review",
                requestedState: normalizedState,
                requestedCity: normalizedCity,
            };
        }

        // Both state and city exist - approve location
        return {
            stateId: state._id,
            cityId: city._id,
            locationStatus: "approved",
            requestedState: "",
            requestedCity: "",
        };
    } catch (error) {
        console.error("Location Validation Error:", error);
        throw error;
    }
};

/**
 * Resolves pending location request during vendor approval
 * Used by admin when approving vendors with pending locations
 * 
 * @param {string} stateName - State name to assign
 * @param {string} cityName - City name to assign
 * @param {boolean} createIfMissing - Whether to create state/city if they don't exist
 * @returns {Object} - { stateId, cityId }
 */
export const resolveVendorLocation = async (
    stateName,
    cityName,
    createIfMissing = false
) => {
    try {
        const normalizedState = stateName?.trim();
        const normalizedCity = cityName?.trim();

        if (!normalizedState || !normalizedCity) {
            throw new Error("State and city are required");
        }

        // Find or create state
        let state = await State.findOne({
            name: { $regex: new RegExp(`^${normalizedState}$`, "i") },
        });

        if (!state && createIfMissing) {
            state = await State.create({
                name: normalizedState,
                isActive: true,
            });
        } else if (!state) {
            throw new Error(`State "${normalizedState}" not found`);
        }

        // Find or create city
        let city = await City.findOne({
            name: { $regex: new RegExp(`^${normalizedCity}$`, "i") },
            stateId: state._id,
        });

        if (!city && createIfMissing) {
            city = await City.create({
                name: normalizedCity,
                stateId: state._id,
                isActive: true,
            });
        } else if (!city) {
            throw new Error(`City "${normalizedCity}" not found in ${state.name}`);
        }

        return {
            stateId: state._id,
            cityId: city._id,
        };
    } catch (error) {
        console.error("Location Resolution Error:", error);
        throw error;
    }
};
