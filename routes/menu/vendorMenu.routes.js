import express from 'express';
import vendorAuth from '../../middleware/vendor.middleware.js';
import {
    // Sections
    createVendorMenuSection,
    getVendorMenuSections,
    updateVendorMenuSection,
    deleteVendorMenuSection,
    // Items
    createMenuItem,
    updateMenuItem,
    toggleMenuItemAvailability,
    toggleMenuItemStock,
    moveItemToSection,
    getVendorMenuItems,
    setMenuItemArchiveStatus,
    // Portions
    addMenuItemPortion,
    updateMenuItemPortion,
    togglePortionStock,
    // Variants
    createMenuVariant,
    updateMenuVariant,
    addMenuVariantComponent,
    toggleVariantAvailability,
    // Choice Groups
    addMenuItemChoiceGroup,
    addMenuItemChoiceOption,
    updateMenuItemChoiceOption,
    // Platform categories reference
    getPlatformCategories,
} from '../../controller/menu/vendorMenuController.js';

const router = express.Router();

// ─── Platform Categories (read-only, public) ───────────────────────────────
router.get('/platform-categories', getPlatformCategories);

// ─── Vendor Menu Sections (display groupings) ──────────────────────────────
router.get('/:vendorId/sections', vendorAuth, getVendorMenuSections);
router.post('/:vendorId/sections', vendorAuth, createVendorMenuSection);
router.put('/:vendorId/sections/:sectionId', vendorAuth, updateVendorMenuSection);
router.delete('/:vendorId/sections/:sectionId', vendorAuth, deleteVendorMenuSection);

// ─── Menu Items ────────────────────────────────────────────────────────────
router.post('/:vendorId/items', vendorAuth, createMenuItem);
router.put('/:vendorId/items/:itemId', vendorAuth, updateMenuItem);
router.patch('/:vendorId/items/:itemId/availability', vendorAuth, toggleMenuItemAvailability);
router.patch('/:vendorId/items/:itemId/stock', vendorAuth, toggleMenuItemStock);
router.patch('/:vendorId/items/:itemId/section', vendorAuth, moveItemToSection);
router.get('/:vendorId/items', vendorAuth, getVendorMenuItems);
router.patch('/:vendorId/items/:itemId/archive', vendorAuth, setMenuItemArchiveStatus);

// ─── Portions ─────────────────────────────────────────────────────────────
router.post('/:vendorId/items/:itemId/portions', vendorAuth, addMenuItemPortion);
router.put('/:vendorId/items/:itemId/portions/:portionId', vendorAuth, updateMenuItemPortion);
router.patch('/:vendorId/items/:itemId/portions/:portionId/stock', vendorAuth, togglePortionStock);

// ─── Variants / Combos ─────────────────────────────────────────────────────
router.post('/:vendorId/variants', vendorAuth, createMenuVariant);
router.put('/:vendorId/variants/:variantId', vendorAuth, updateMenuVariant);
router.post('/:vendorId/variants/:variantId/components', vendorAuth, addMenuVariantComponent);
router.patch('/:vendorId/variants/:variantId/availability', vendorAuth, toggleVariantAvailability);

// ─── Choice Groups (item-level add-ons) ────────────────────────────────────
router.post('/:vendorId/items/:itemId/choice-groups', vendorAuth, addMenuItemChoiceGroup);
router.post('/choice-groups/:groupId/options', vendorAuth, addMenuItemChoiceOption);
router.patch('/choice-options/:optionId', vendorAuth, updateMenuItemChoiceOption);

export default router;
