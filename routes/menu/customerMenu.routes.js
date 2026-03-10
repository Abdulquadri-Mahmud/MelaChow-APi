import express from 'express';
import {
    getFullVendorMenu,
    getMenuItemDetails,
    getMenuVariantDetails,
    getItemsByPlatformCategory,
    getVendorsByPlatformCategory,
} from '../../controller/menu/customerMenuController.js';

const router = express.Router();

// ─── Vendor-specific menu (customer facing) ────────────────────────────────
router.get('/:vendorId/menu', getFullVendorMenu);
router.get('/:vendorId/menu/items/:itemId', getMenuItemDetails);
router.get('/:vendorId/menu/variants/:variantId', getMenuVariantDetails);

// ─── Marketplace discovery by platform category ────────────────────────────
router.get('/marketplace/categories/:categoryId/items', getItemsByPlatformCategory);
router.get('/marketplace/categories/:categoryId/vendors', getVendorsByPlatformCategory);

export default router;
