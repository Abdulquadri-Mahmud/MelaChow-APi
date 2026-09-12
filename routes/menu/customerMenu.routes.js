import express from 'express';
import optionalAuth from '../../middleware/optionalAuth.middleware.js';
import {
    getFullVendorMenu,
    getMenuItemDetails,
    getComboDetails,
    getItemsByPlatformCategory,
    getVendorsByPlatformCategory,
    getPublicFoodDetail,
} from '../../controller/menu/customerMenuController.js';

const router = express.Router();

// ─── Standalone food detail — no vendorId needed ────────────────────────────
// MUST be declared before /:vendorId routes to avoid param conflict
router.get('/foods/:foodId', getPublicFoodDetail);

// ─── Vendor-specific menu (customer facing) ────────────────────────────────
router.get('/:vendorId/menu', optionalAuth, getFullVendorMenu);
router.get('/:vendorId/menu/items/:itemId', getMenuItemDetails);
router.get('/:vendorId/menu/combos/:comboId', getComboDetails);

// ─── Marketplace discovery by platform category ────────────────────────────
router.get('/marketplace/categories/:categoryId/items', getItemsByPlatformCategory);
router.get('/marketplace/categories/:categoryId/vendors', getVendorsByPlatformCategory);

export default router;
