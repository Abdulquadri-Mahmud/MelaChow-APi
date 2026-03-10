import MenuItem from '../model/menu/MenuItem.js';
import MenuItemPortion from '../model/menu/MenuItemPortion.js';
import Category from '../model/category.model.js';
import { MenuVariant, VariantChoiceGroup } from '../model/menu/MenuVariant.js';

export const MenuService = {
    /**
     * Validates that a platform category is active and is a LEAF node (no children).
     * Vendors can only assign items to leaf categories for better marketplace discovery.
     */
    async ensureLeafCategory(categoryId) {
        const category = await Category.findById(categoryId);
        if (!category) throw new Error('Category not found');
        if (!category.isActive) throw new Error('Category is currently inactive');

        // Root node if parent is null. But we need to check if IT has children.
        const childCategoriesCount = await Category.countDocuments({ parent: categoryId, isActive: true });
        if (childCategoriesCount > 0) {
            throw new Error('Please select a more specific sub-category. Items can only be assigned to leaf categories.');
        }

        return category;
    },

    /**
     * Cascade availability from portions to parent MenuItem.
     * If ALL portions of an item are out of stock, parent is marked out of stock.
     */
    async updateMenuItemStockStatus(menuItemId) {
        const portions = await MenuItemPortion.find({ menu_item_id: menuItemId, is_available: true });

        // If no portions are in stock, parent is out of stock
        const anyInStock = portions.some(p => p.is_in_stock);

        await MenuItem.findByIdAndUpdate(menuItemId, { is_in_stock: anyInStock });
        return anyInStock;
    },

    /**
     * Cascade availability from components/choices to parent MenuVariant.
     */
    async updateMenuVariantStockStatus(variantId) {
        const requiredGroups = await VariantChoiceGroup.find({ variant_id: variantId, is_required: true });

        // Logic: If any required group has zero in-stock options, the variant itself is out of stock.
        // [Implementation varies based on the ChoiceOption model linked to the groups]
        // ...
    }
};
