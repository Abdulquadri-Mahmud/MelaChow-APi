import { CartService } from '../../services/cart.service.js';
import { Cart, VendorSubCart, CartLineItem } from '../../model/menu/Cart.js';

/**
 * Add an item to the cart. Always creates a new row.
 */
export const addCartItem = async (req, res) => {
    try {
        const userId = req.user._id;
        const { line_item_type, ...payload } = req.body;

        let result;
        if (line_item_type === 'PORTION_ITEM') {
            result = await CartService.addPortionItem(userId, payload);
        } else if (line_item_type === 'VARIANT_ITEM') {
            result = await CartService.addVariantItem(userId, payload);
        } else {
            return res.status(400).json({ success: false, message: 'Invalid line_item_type' });
        }

        res.status(201).json({
            success: true,
            ...result
        });
    } catch (error) {
        res.status(422).json({ success: false, message: error.message });
    }
};

/**
 * Get the full cart with sub-carts and line items.
 */
export const getCart = async (req, res) => {
    try {
        const userId = req.user._id;
        const cart = await CartService.getCart(userId);
        if (!cart) {
            return res.status(200).json({ success: true, message: "Cart is empty", vendor_sub_carts: [], cart_summary: { vendor_count: 0, total_items: 0, subtotal: 0 } });
        }
        res.status(200).json(cart);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Remove a specific cart line item.
 */
export const removeCartItem = async (req, res) => {
    try {
        const { lineItemId } = req.params;
        const lineItem = await CartLineItem.findById(lineItemId);
        if (!lineItem) return res.status(404).json({ success: false, message: 'Item not found' });

        const subCartId = lineItem.vendor_sub_cart_id;
        await CartLineItem.findByIdAndDelete(lineItemId);

        // If sub-cart is empty, delete it
        const remainingItems = await CartLineItem.countDocuments({ vendor_sub_cart_id: subCartId });
        if (remainingItems === 0) {
            await VendorSubCart.findByIdAndDelete(subCartId);
        }

        res.status(200).json({ success: true, message: 'Item removed' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Clear items from a specific vendor in the cart.
 */
export const removeVendorSubCart = async (req, res) => {
    try {
        const { vendorId } = req.params;
        const userId = req.user._id;

        const cart = await Cart.findOne({ customer_id: userId, status: 'ACTIVE' });
        if (!cart) return res.status(404).json({ success: false, message: 'Cart not found' });

        const subCart = await VendorSubCart.findOne({ cart_id: cart._id, vendor_id: vendorId });
        if (!subCart) return res.status(404).json({ success: false, message: 'Vendor sub-cart not found' });

        await CartLineItem.deleteMany({ vendor_sub_cart_id: subCart._id });
        await VendorSubCart.findByIdAndDelete(subCart._id);

        res.status(200).json({ success: true, message: 'Vendor items removed' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
