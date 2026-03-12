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
    deleteMenuItem,
    // Portions
    addMenuItemPortion,
    updateMenuItemPortion,
    togglePortionStock,
    deleteMenuItemPortion,
    // Variants
    createMenuVariant,
    updateMenuVariant,
    addMenuVariantComponent,
    deleteMenuVariantComponent,
    toggleVariantAvailability,
    createVariantChoiceGroup,
    createVariantChoiceOption,
    // Choice Groups (item-level)
    addMenuItemChoiceGroup,
    addMenuItemChoiceOption,
    updateMenuItemChoiceGroup,
    updateMenuItemChoiceOption,
    deleteMenuItemChoiceGroup,
    deleteMenuItemChoiceOption,
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
router.delete('/:vendorId/items/:itemId/portions/:portionId', vendorAuth, deleteMenuItemPortion);

// ─── Choice Groups (item-level add-ons) — BEFORE item delete to avoid shadowing ─
router.post('/:vendorId/items/:itemId/choice-groups', vendorAuth, addMenuItemChoiceGroup);
router.put('/:vendorId/items/:itemId/choice-groups/:groupId', vendorAuth, updateMenuItemChoiceGroup);
router.delete('/:vendorId/items/:itemId/choice-groups/:groupId', vendorAuth, deleteMenuItemChoiceGroup);
router.post('/choice-groups/:groupId/options', vendorAuth, addMenuItemChoiceOption);
router.patch('/choice-options/:optionId', vendorAuth, updateMenuItemChoiceOption);
router.delete('/choice-groups/:groupId/options/:optionId', vendorAuth, deleteMenuItemChoiceOption);

// ─── Hard delete item (least specific — must come AFTER sub-resource routes) ──
router.delete('/:vendorId/items/:itemId', vendorAuth, deleteMenuItem);

// ─── Variants / Combos ─────────────────────────────────────────────────────
router.post('/:vendorId/variants', vendorAuth, createMenuVariant);
router.put('/:vendorId/variants/:variantId', vendorAuth, updateMenuVariant);
router.post('/:vendorId/variants/:variantId/components', vendorAuth, addMenuVariantComponent);
router.delete('/:vendorId/variants/:variantId/components/:componentId', vendorAuth, deleteMenuVariantComponent);
router.patch('/:vendorId/variants/:variantId/availability', vendorAuth, toggleVariantAvailability);
router.post('/:vendorId/variants/:variantId/choice-groups', vendorAuth, createVariantChoiceGroup);
router.post('/variant-choice-groups/:groupId/options', vendorAuth, createVariantChoiceOption);

export default router;
