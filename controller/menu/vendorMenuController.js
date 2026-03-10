import MenuCategory from '../../model/menu/MenuCategory.js';
import MenuItem from '../../model/menu/MenuItem.js';
import MenuItemPortion from '../../model/menu/MenuItemPortion.js';
import { MenuItemChoiceGroup, MenuItemChoiceOption } from '../../model/menu/MenuItemChoice.js';
import { MenuVariant, MenuVariantComponent, VariantChoiceGroup, VariantChoiceOption } from '../../model/menu/MenuVariant.js';
import { MenuService } from '../../services/menu.service.js';

/**
 * 1. Categorization
 */
export const createMenuCategory = async (req, res) => {
    try {
        const { vendor_id, name, description, image_url, sort_order } = req.body;
        const category = await MenuCategory.create({ vendor_id, name, description, image_url, sort_order });
        res.status(201).json({ success: true, category });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 2. Menu Item Management
 */
export const createMenuItem = async (req, res) => {
    try {
        const { vendor_id, category_id, name, description, image_url, item_type, sort_order, prep_time_minutes, tags } = req.body;
        const item = await MenuItem.create({
            vendor_id, category_id, name, description, image_url, item_type, sort_order, prep_time_minutes, tags,
            is_available: true, is_in_stock: true, is_archived: false
        });
        res.status(201).json({ success: true, item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const addMenuItemPortion = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { label, price, is_default, max_quantity, sort_order } = req.body;

        // If setting a new default, unset existing default
        if (is_default) {
            await MenuItemPortion.updateMany({ menu_item_id: itemId }, { is_default: false });
        }

        const portion = await MenuItemPortion.create({
            menu_item_id: itemId, label, price, is_default, max_quantity, sort_order,
            is_available: true, is_in_stock: true
        });

        // Cascade status check
        await MenuService.updateMenuItemStockStatus(itemId);

        res.status(201).json({ success: true, portion });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 3. Variant / Combo Management
 */
export const createMenuVariant = async (req, res) => {
    try {
        const { vendor_id, name, description, image_url, price, sort_order, prep_time_minutes, tags } = req.body;
        const variant = await MenuVariant.create({
            vendor_id, name, description, image_url, price, sort_order, prep_time_minutes, tags,
            is_available: true, is_in_stock: true, is_archived: false
        });
        res.status(201).json({ success: true, variant });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const addMenuVariantComponent = async (req, res) => {
    try {
        const { variantId } = req.params;
        const { component_type, menu_item_id, portion_id, quantity, label, choice_group_id, sort_order } = req.body;

        const component = await MenuVariantComponent.create({
            variant_id: variantId, component_type, menu_item_id, portion_id, quantity, label, choice_group_id, sort_order
        });

        res.status(201).json({ success: true, component });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * 4. Control Endpoints
 */
export const toggleMenuItemAvailability = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { is_available, is_in_stock } = req.body;
        const update = {};
        if (is_available !== undefined) update.is_available = is_available;
        if (is_in_stock !== undefined) update.is_in_stock = is_in_stock;

        const item = await MenuItem.findByIdAndUpdate(itemId, update, { new: true });
        res.status(200).json({ success: true, item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const toggleMenuVariantAvailability = async (req, res) => {
    try {
        const { variantId } = req.params;
        const { is_available, is_in_stock } = req.body;
        const update = {};
        if (is_available !== undefined) update.is_available = is_available;
        if (is_in_stock !== undefined) update.is_in_stock = is_in_stock;

        const variant = await MenuVariant.findByIdAndUpdate(variantId, update, { new: true });
        res.status(200).json({ success: true, variant });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
