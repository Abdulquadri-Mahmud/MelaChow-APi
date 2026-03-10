import express from 'express';
import {
    getFullVendorMenu,
    getMenuItemDetails
} from '../../controller/menu/customerMenuController.js';

const router = express.Router();

/**
 * 1. Customer Access to Menu
 */
router.get('/:vendorId/menu', getFullVendorMenu);
router.get('/items/:itemId', getMenuItemDetails);

export default router;
