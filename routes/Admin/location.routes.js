import express from "express";
import { adminAuth } from "../../middleware/adminAuth.js";
import { getAllCities, getAllStates, getLocationRequests } from "../../controller/Admin/location.controller.js";

const router = express.Router();

// All routes require admin authentication
router.use(adminAuth);

const retiredLocationWrite = (_req, res) => res.status(410).json({ success: false, message: "Manual state and city management has been retired. Use Google-confirmed addresses and Delivery & Location Control." });

// Read-only compatibility for historical rider/vendor records.
router.post("/states", retiredLocationWrite);
router.get("/states", getAllStates);
router.patch("/states/:id/activate", retiredLocationWrite);

// City management
router.post("/cities", retiredLocationWrite);
router.get("/cities", getAllCities);
router.patch("/cities/:id/activate", retiredLocationWrite);
router.patch("/cities/:id", retiredLocationWrite);

// Location requests from vendors
router.get("/location-requests", getLocationRequests);

export default router;
