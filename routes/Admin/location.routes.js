import express from "express";
import { adminAuth } from "../../middleware/adminAuth.js";
import {
    createCity,
    createState,
    getAllCities,
    getAllStates,
    getLocationRequests,
    toggleCityStatus,
    toggleStateStatus,
    updateCity
} from "../../controller/Admin/location.controller.js";

const router = express.Router();

// All routes require admin authentication
router.use(adminAuth);

// State management
router.post("/states", createState);
router.get("/states", getAllStates);
router.patch("/states/:id/activate", toggleStateStatus);

// City management
router.post("/cities", createCity);
router.get("/cities", getAllCities);
router.patch("/cities/:id/activate", toggleCityStatus);
router.patch("/cities/:id", updateCity);

// Location requests from vendors
router.get("/location-requests", getLocationRequests);

export default router;
