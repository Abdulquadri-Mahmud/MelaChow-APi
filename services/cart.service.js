import { Cart, VendorSubCart, CartLineItem } from '../model/menu/Cart.js';
import MenuItem from '../model/menu/MenuItem.js';
import MenuItemPortion from '../model/menu/MenuItemPortion.js';
import { MenuItemChoiceGroup, MenuItemChoiceOption } from '../model/menu/MenuItemChoice.js';
import { MenuVariant, MenuVariantComponent, VariantChoiceGroup, VariantChoiceOption } from '../model/menu/MenuVariant.js';
import Vendor from '../model/vendor/vendor.model.js';

export const CartService = {
    /**
     * Adds a portion-based item to the cart. Always creates a new row.
     */
    async addPortionItem(userId, { vendor_id, menu_item_id, portion_id, quantity, selected_choices = [], special_instructions }) {
        // 1. Find or create an active cart for the user
        let cart = await Cart.findOne({ customer_id: userId, status: 'ACTIVE' });
        if (!cart) {
            cart = await Cart.create({ customer_id: userId, status: 'ACTIVE', expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) });
        }

        // 2. Resolve or create VendorSubCart
        let subCart = await VendorSubCart.findOne({ cart_id: cart._id, vendor_id });
        if (!subCart) {
            const vendor = await Vendor.findById(vendor_id);
            if (!vendor) throw new Error('Vendor not found');
            subCart = await VendorSubCart.create({ cart_id: cart._id, vendor_id, vendor_name: vendor.storeName });
        }

        // 3. Resolve MenuItem and Portion for snapshotting
        const item = await MenuItem.findById(menu_item_id);
        const portion = await MenuItemPortion.findById(portion_id);
        if (!item || !portion) throw new Error('Item or Portion not found');

        // Hard availability check
        if (!item.is_available || !item.is_in_stock || item.is_archived || !portion.is_available || !portion.is_in_stock) {
            throw new Error('Item or portion is currently unavailable');
        }

        // Portion max_quantity check
        if (portion.max_quantity && quantity > portion.max_quantity) {
            throw new Error(`Maximum ${portion.max_quantity} portions of ${item.name} per order action.`);
        }

        // 4. Resolve Choices and Snapshot prices
        const resolvedChoices = [];
        let choicesPrice = 0;

        for (const selection of selected_choices) {
            const group = await MenuItemChoiceGroup.findById(selection.group_id);
            const options = await MenuItemChoiceOption.find({ _id: { $in: selection.option_ids }, is_available: true });

            if (options.length < selection.option_ids.length) {
                throw new Error(`One or more choices for group ${group.name} are unavailable`);
            }

            const choiceSelection = {
                group_id: group._id,
                group_name: group.name,
                options: options.map(o => {
                    choicesPrice += o.price_modifier;
                    return {
                        option_id: o._id,
                        label: o.label,
                        price_modifier: o.price_modifier
                    };
                })
            };
            resolvedChoices.push(choiceSelection);
        }

        // 5. Calculate final price (all in kobo)
        const unitPrice = portion.price;
        const totalLinePrice = (unitPrice + choicesPrice) * quantity;

        // 6. Create NEW CartLineItem
        const lineItem = await CartLineItem.create({
            vendor_sub_cart_id: subCart._id,
            line_item_type: 'PORTION_ITEM',
            menu_item_id: item._id,
            portion_id: portion._id,
            quantity,
            selected_choices: resolvedChoices,
            unit_price: unitPrice,
            choices_price: choicesPrice,
            total_price: totalLinePrice,
            special_instructions,
            item_status_at_add: 'AVAILABLE'
        });

        return { lineItem, subCartId: subCart._id };
    },

    /**
     * Adds a variant/combo-based item to the cart. Always creates a new row.
     */
    async addVariantItem(userId, { vendor_id, variant_id, quantity, variant_choices = [], special_instructions }) {
        // 1. Find or create an active cart for the user
        let cart = await Cart.findOne({ customer_id: userId, status: 'ACTIVE' });
        if (!cart) {
            cart = await Cart.create({ customer_id: userId, status: 'ACTIVE', expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) });
        }

        // 2. Resolve or create VendorSubCart
        let subCart = await VendorSubCart.findOne({ cart_id: cart._id, vendor_id });
        if (!subCart) {
            const vendor = await Vendor.findById(vendor_id);
            if (!vendor) throw new Error('Vendor not found');
            subCart = await VendorSubCart.create({ cart_id: cart._id, vendor_id, vendor_name: vendor.storeName });
        }

        // 3. Resolve MenuVariant for snapshotting
        const variant = await MenuVariant.findById(variant_id);
        if (!variant || !variant.is_available || !variant.is_in_stock || variant.is_archived) {
            throw new Error('Variant is currently unavailable');
        }

        // 4. Resolve Choices and Snapshot prices
        const resolvedChoices = [];
        let choicesPrice = 0;

        for (const selection of variant_choices) {
            const group = await VariantChoiceGroup.findById(selection.group_id);
            const options = await VariantChoiceOption.find({ _id: { $in: selection.option_ids }, is_available: true });

            if (options.length < selection.option_ids.length) {
                throw new Error(`One or more choices for group ${group.name} are unavailable`);
            }

            const choiceSelection = {
                component_id: selection.component_id,
                group_id: group._id,
                group_name: group.name,
                options: options.map(o => {
                    choicesPrice += o.price_modifier;
                    return {
                        option_id: o._id,
                        label: o.label,
                        price_modifier: o.price_modifier
                    };
                })
            };
            resolvedChoices.push(choiceSelection);
        }

        // 5. Calculate final price (all in kobo)
        const basePrice = variant.price;
        const totalLinePrice = (basePrice + choicesPrice) * quantity;

        // 6. Create NEW CartLineItem
        const lineItem = await CartLineItem.create({
            vendor_sub_cart_id: subCart._id,
            line_item_type: 'VARIANT_ITEM',
            variant_id: variant._id,
            variant_choices: resolvedChoices,
            base_price: basePrice,
            choices_price: choicesPrice,
            total_price: totalLinePrice,
            quantity,
            special_instructions,
            item_status_at_add: 'AVAILABLE'
        });

        return { lineItem, subCartId: subCart._id };
    },

    /**
     * Get the full cart with sub-carts and line items.
     */
    async getCart(userId) {
        const cart = await Cart.findOne({ customer_id: userId, status: 'ACTIVE' });
        if (!cart) return null;

        const subCarts = await VendorSubCart.find({ cart_id: cart._id });
        const fullSubCarts = [];
        let cartSubtotal = 0;
        let totalItems = 0;

        for (const sub of subCarts) {
            const lineItems = await CartLineItem.find({ vendor_sub_cart_id: sub._id });
            let subtotal = 0;

            for (const item of lineItems) {
                subtotal += item.total_price;
                totalItems += item.quantity;
                // In the full implementation, you'd re-verify the price/availability status here to set flags.
            }

            cartSubtotal += subtotal;
            fullSubCarts.push({
                ...sub.toObject(),
                line_items: lineItems,
                sub_total: subtotal,
                flags: []
            });
        }

        return {
            cart_id: cart._id,
            status: cart.status,
            vendor_sub_carts: fullSubCarts,
            cart_summary: {
                vendor_count: subCarts.length,
                total_items: totalItems,
                subtotal: cartSubtotal,
                note: "Prices in kobo. Divide by 100 for Naira display."
            }
        };
    }
};
