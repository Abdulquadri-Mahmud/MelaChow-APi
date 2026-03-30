import mongoose from 'mongoose';
import { Cart, VendorSubCart, CartLineItem } from '../model/menu/Cart.js';
import Order from '../model/order/order.model.js';
import VendorOrder from '../model/vendor/VendorOrder.js';
import Vendor from '../model/vendor/vendor.model.js';
import MenuItem from '../model/menu/MenuItem.js';
import MenuItemPortion from '../model/menu/MenuItemPortion.js';
// TODO: ComboItem replaces MenuVariant — update order v1 service if combos are used
// import { MenuVariant } from '../model/menu/MenuVariant.js';
import crypto from 'crypto';

export const OrderV1Service = {
    /**
     * Create a new Order from an active Cart.
     */
    async checkout(userId, { delivery_address, payment_method, note }) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // 1. Get Active Cart
            const cart = await Cart.findOne({ customer_id: userId, status: 'ACTIVE' }).session(session);
            if (!cart) throw new Error('No active cart found');

            const subCarts = await VendorSubCart.find({ cart_id: cart._id }).session(session);
            if (!subCarts || subCarts.length === 0) throw new Error('Cart is empty');

            // 2. Resolve and Validate Items
            const vendorOrdersData = [];
            let totalSubtotal = 0;
            const masterItems = [];

            for (const sub of subCarts) {
                const lineItems = await CartLineItem.find({ vendor_sub_cart_id: sub._id }).session(session);
                if (lineItems.length === 0) continue;

                const vendor = await Vendor.findById(sub.vendor_id).session(session);
                const vendorItems = [];
                let vendorSubtotal = 0;

                for (const li of lineItems) {
                    // Re-validate stock and availability
                    await this._validateLineItem(li, session);

                    const itemData = this._shapeOrderItem(li);
                    vendorItems.push(itemData);
                    masterItems.push({ ...itemData, restaurantId: sub.vendor_id });
                    vendorSubtotal += li.total_price;
                }

                totalSubtotal += vendorSubtotal;

                // Calculate commissions (example 10%)
                const commissionRate = vendor.commissionRate || 0.1;
                const commission = Math.round(vendorSubtotal * commissionRate);

                vendorOrdersData.push({
                    restaurantId: sub.vendor_id,
                    items: vendorItems,
                    vendorSubtotal,
                    commission,
                    vendorTotal: vendorSubtotal - commission, // What vendor keeps from food
                    deliveryFee: vendor.flatRateDeliveryFee || 0, // Simplified for now
                });
            }

            const totalDeliveryFee = vendorOrdersData.reduce((sum, v) => sum + v.deliveryFee, 0);
            const totalAmount = totalSubtotal + totalDeliveryFee;

            // 3. Create Master Order
            const orderId = `ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
            const masterOrder = await Order.create([{
                userId,
                orderId,
                items: masterItems,
                subtotal: totalSubtotal,
                deliveryFee: totalDeliveryFee,
                total: totalAmount,
                paymentStatus: 'pending',
                paymentMethod: payment_method || 'card',
                orderStatus: 'pending',
                deliveryAddress: delivery_address,
                phone: delivery_address.phone,
                vendorDeliveryFees: vendorOrdersData.map(v => ({
                    restaurantId: v.restaurantId,
                    deliveryFee: v.deliveryFee
                })),
                statusLog: [{ status: 'pending', changedBy: 'customer' }]
            }], { session });

            // 4. Create Vendor Orders
            for (const vData of vendorOrdersData) {
                await VendorOrder.create([{
                    restaurantId: vData.restaurantId,
                    userOrderId: masterOrder[0]._id,
                    items: vData.items,
                    vendorSubtotal: vData.vendorSubtotal,
                    commission: vData.commission,
                    vendorTotal: vData.vendorTotal,
                    deliveryFee: vData.deliveryFee,
                    orderStatus: 'pending',
                }], { session });
            }

            // 5. Update Cart status
            cart.status = 'CHECKED_OUT';
            await cart.save({ session });

            await session.commitTransaction();
            session.endSession();

            return masterOrder[0];
        } catch (error) {
            await session.abortTransaction();
            session.endSession();
            throw error;
        }
    },

    /**
     * Re-validate that a cart line item is still valid (price/stock).
     */
    async _validateLineItem(li, session) {
        if (li.line_item_type === 'PORTION_ITEM') {
            const item = await MenuItem.findById(li.menu_item_id).session(session);
            const portion = await MenuItemPortion.findById(li.portion_id).session(session);

            if (!item || !portion || !item.is_available || !item.is_in_stock || !portion.is_available || !portion.is_in_stock) {
                throw new Error(`Item ${item?.name || 'Unknown'} is no longer available.`);
            }

            // Price validation check (snapshot vs current)
            if (portion.price !== li.unit_price) {
                // In a production app, you might auto-update the cart or alert the user.
                // For now, we block if the price changed for security.
                throw new Error(`Price for ${item.name} has changed. Please refresh your cart.`);
            }
        } else if (li.line_item_type === 'VARIANT_ITEM') {
            const variant = await MenuVariant.findById(li.variant_id).session(session);
            if (!variant || !variant.is_available || !variant.is_in_stock) {
                throw new Error(`Variant ${variant?.name || 'Combo'} is no longer available.`);
            }

            if (variant.price !== li.base_price) {
                throw new Error(`Price for ${variant.name} has changed. Please refresh your cart.`);
            }
        }
    },

    /**
     * Shape cart line item into the format expected by the Order model's item schema.
     */
    _shapeOrderItem(li) {
        return {
            // We use 'foodId' field for MenuItem ID for compatibility with existing Order schema if possible, 
            // but we might need to adjust the Order schema virtuals or refs.
            foodId: li.menu_item_id || li.variant_id, 
            name: li.line_item_type === 'PORTION_ITEM' ? "Portion Item" : "Variant Item", // Should ideally fetch item name
            quantity: li.quantity,
            price: li.total_price / li.quantity, // Unit price including choices
            metadata: {
                line_item_type: li.line_item_type,
                portion_id: li.portion_id,
                variant_id: li.variant_id,
                selected_choices: li.selected_choices || li.variant_choices,
                special_instructions: li.special_instructions
            }
        };
    }
};
