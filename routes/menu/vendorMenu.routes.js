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
import {
    createChoiceGroupTemplate,
    duplicateChoiceGroupTemplate,
    listChoiceGroupTemplates,
    setChoiceGroupTemplateArchiveStatus,
    updateChoiceGroupTemplate,
} from '../../controller/menu/choiceGroupTemplateController.js';

const router = express.Router();

const requireSameVendor = (req, res, next) => {
    if (req.vendor?._id?.toString() !== req.params.vendorId) {
        return res.status(403).json({
            success: false,
            message: 'Access denied. You can only manage your own menu.',
        });
    }
    return next();
};

// ─── Platform Categories (read-only, public) ───────────────────────────────
router.get('/platform-categories', getPlatformCategories);

// ─── Vendor Menu Sections (display groupings) ──────────────────────────────
router.get('/:vendorId/sections', vendorAuth, requireSameVendor, getVendorMenuSections);
router.post('/:vendorId/sections', vendorAuth, requireSameVendor, createVendorMenuSection);
router.put('/:vendorId/sections/:sectionId', vendorAuth, requireSameVendor, updateVendorMenuSection);
router.delete('/:vendorId/sections/:sectionId', vendorAuth, requireSameVendor, deleteVendorMenuSection);

// Reusable choice-group templates. Selecting one copies it into an item.
router.get('/:vendorId/choice-group-templates', vendorAuth, requireSameVendor, listChoiceGroupTemplates);
router.post('/:vendorId/choice-group-templates', vendorAuth, requireSameVendor, createChoiceGroupTemplate);
router.put('/:vendorId/choice-group-templates/:templateId', vendorAuth, requireSameVendor, updateChoiceGroupTemplate);
router.post('/:vendorId/choice-group-templates/:templateId/duplicate', vendorAuth, requireSameVendor, duplicateChoiceGroupTemplate);
router.patch('/:vendorId/choice-group-templates/:templateId/archive', vendorAuth, requireSameVendor, setChoiceGroupTemplateArchiveStatus);

// ─── Menu Items ────────────────────────────────────────────────────────────
router.post('/:vendorId/items', vendorAuth, requireSameVendor, createMenuItem);
router.put('/:vendorId/items/:itemId', vendorAuth, requireSameVendor, updateMenuItem);
router.patch('/:vendorId/items/:itemId/availability', vendorAuth, requireSameVendor, toggleMenuItemAvailability);
router.patch('/:vendorId/items/:itemId/stock', vendorAuth, requireSameVendor, toggleMenuItemStock);
router.patch('/:vendorId/items/:itemId/section', vendorAuth, requireSameVendor, moveItemToSection);
router.get('/:vendorId/items', vendorAuth, requireSameVendor, getVendorMenuItems);
router.patch('/:vendorId/items/:itemId/archive', vendorAuth, requireSameVendor, setMenuItemArchiveStatus);

// ─── Portions ─────────────────────────────────────────────────────────────
router.post('/:vendorId/items/:itemId/portions', vendorAuth, requireSameVendor, addMenuItemPortion);
router.put('/:vendorId/items/:itemId/portions/:portionId', vendorAuth, requireSameVendor, updateMenuItemPortion);
router.patch('/:vendorId/items/:itemId/portions/:portionId/stock', vendorAuth, requireSameVendor, togglePortionStock);
router.delete('/:vendorId/items/:itemId/portions/:portionId', vendorAuth, requireSameVendor, deleteMenuItemPortion);

// ─── Choice Groups (item-level add-ons) — BEFORE item delete to avoid shadowing ─
router.post('/:vendorId/items/:itemId/choice-groups', vendorAuth, requireSameVendor, addMenuItemChoiceGroup);
router.put('/:vendorId/items/:itemId/choice-groups/:groupId', vendorAuth, requireSameVendor, updateMenuItemChoiceGroup);
router.delete('/:vendorId/items/:itemId/choice-groups/:groupId', vendorAuth, requireSameVendor, deleteMenuItemChoiceGroup);
router.post('/choice-groups/:groupId/options', vendorAuth, addMenuItemChoiceOption);
router.patch('/choice-options/:optionId', vendorAuth, updateMenuItemChoiceOption);
router.delete('/choice-groups/:groupId/options/:optionId', vendorAuth, deleteMenuItemChoiceOption);

// ─── Hard delete item (least specific — must come AFTER sub-resource routes) ──
router.delete('/:vendorId/items/:itemId', vendorAuth, requireSameVendor, deleteMenuItem);

// ─── Variants / Combos ─────────────────────────────────────────────────────
router.post('/:vendorId/variants', vendorAuth, requireSameVendor, createMenuVariant);
router.put('/:vendorId/variants/:variantId', vendorAuth, requireSameVendor, updateMenuVariant);
router.post('/:vendorId/variants/:variantId/components', vendorAuth, requireSameVendor, addMenuVariantComponent);
router.delete('/:vendorId/variants/:variantId/components/:componentId', vendorAuth, requireSameVendor, deleteMenuVariantComponent);
router.patch('/:vendorId/variants/:variantId/availability', vendorAuth, requireSameVendor, toggleVariantAvailability);
router.post('/:vendorId/variants/:variantId/choice-groups', vendorAuth, requireSameVendor, createVariantChoiceGroup);
router.post('/variant-choice-groups/:groupId/options', vendorAuth, createVariantChoiceOption);

export default router;
