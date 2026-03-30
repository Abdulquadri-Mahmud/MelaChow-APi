import express from "express";
import vendorAuth from "../../middleware/vendor.middleware.js";
import {
    createComboItem,
    getVendorCombos,
    getComboById,
    updateComboItem,
    toggleComboAvailability,
    archiveComboItem,
} from "../../controller/menu/vendorComboController.js";

const router = express.Router();

// ─── Combo Items ───────────────────────────────────────────
router.post("/", vendorAuth, createComboItem);
router.get("/vendor/:vendorId", getVendorCombos);
router.get("/:comboId", getComboById);
router.patch("/:comboId", vendorAuth, updateComboItem);
router.patch("/:comboId/availability", vendorAuth, toggleComboAvailability);
router.patch("/:comboId/archive", vendorAuth, archiveComboItem);

export default router;
