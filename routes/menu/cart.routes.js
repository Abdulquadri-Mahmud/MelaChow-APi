import express from 'express';
import {
    addCartItem,
    getCart,
    removeCartItem,
    removeVendorSubCart
} from '../../controller/menu/cartController.js';
import userAuth from '../../middleware/verifyToken.js';

const router = express.Router();

/**
 * 1. Customer Cart Management
 */
router.post('/items', userAuth, addCartItem);
router.get('/', userAuth, getCart);
router.delete('/items/:lineItemId', userAuth, removeCartItem);
router.delete('/vendors/:vendorId', userAuth, removeVendorSubCart);

export default router;
