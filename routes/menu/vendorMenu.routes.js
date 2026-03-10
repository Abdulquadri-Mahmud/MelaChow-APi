import express from 'express';
import {
    createMenuCategory,
    createMenuItem,
    addMenuItemPortion,
    createMenuVariant,
    addMenuVariantComponent,
    toggleMenuItemAvailability,
    toggleMenuVariantAvailability
} from '../../controller/menu/vendorMenuController.js';
import vendorAuth from '../../middleware/vendor.middleware.js';

const router = express.Router();

/**
 * Categorization
 */
router.post('/categories', vendorAuth, createMenuCategory);

/**
 * Menu Item Management
 */
router.post('/items', vendorAuth, createMenuItem);
router.post('/items/:itemId/portions', vendorAuth, addMenuItemPortion);
router.patch('/items/:itemId/availability', vendorAuth, toggleMenuItemAvailability);

/**
 * Variant / Combo Management
 */
router.post('/variants', vendorAuth, createMenuVariant);
router.post('/variants/:variantId/components', vendorAuth, addMenuVariantComponent);
router.patch('/variants/:variantId/availability', vendorAuth, toggleMenuVariantAvailability);

export default router;
