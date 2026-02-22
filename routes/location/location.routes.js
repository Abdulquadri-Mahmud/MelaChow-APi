import express from "express";
import {
    getActiveStates,
    getActiveCities,
    getActiveCitiesWithVendors,
} from "../../controller/location/location.controller.js";

const router = express.Router();

// Public routes - no authentication required
router.get("/states", getActiveStates);
router.get("/cities", getActiveCities);
router.get("/cities/with-vendors", getActiveCitiesWithVendors);

export default router;
