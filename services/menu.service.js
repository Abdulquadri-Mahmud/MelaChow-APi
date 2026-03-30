import MenuItem from '../model/menu/MenuItem.js';
import MenuItemPortion from '../model/menu/MenuItemPortion.js';
import Category from '../model/category.model.js';
// TODO: ComboItem replaces MenuVariant — update stock cascading logic if needed for combos
// import { MenuVariant, MenuVariantComponent, VariantChoiceGroup, VariantChoiceOption } from '../model/menu/MenuVariant.js';

export const MenuService = {
    /**
     * Validates that a platform category exists, is active, and is a LEAF node (no children).
     * Vendors can only assign items to leaf categories for precise marketplace discovery.
     */
    async ensureLeafCategory(categoryId) {
        const category = await Category.findById(categoryId);
        if (!category) throw new Error('Category not found');
        if (!category.isActive) throw new Error('Category is currently inactive');

        const childCount = await Category.countDocuments({ parent: categoryId, isActive: true });
        if (childCount > 0) {
            throw new Error(
                'Please select a more specific sub-category. Items can only be assigned to leaf categories, not parent categories.'
            );
        }

        return category;
    },

    /**
     * Cascade stock status from portions to parent MenuItem.
     * Called after any portion's is_in_stock changes.
     *
     * Logic:
     *   - If ALL available portions are is_in_stock: false → parent is out of stock
     *   - If ANY available portion is is_in_stock: true  → parent is in stock
     */
    async updateMenuItemStockStatus(menuItemId) {
        const portions = await MenuItemPortion.find({ menu_item_id: menuItemId, is_available: true });

        const anyInStock = portions.some(p => p.is_in_stock);

        await MenuItem.findByIdAndUpdate(menuItemId, { is_in_stock: anyInStock });
        return anyInStock;
    },

    /**
     * Cascade stock status from variant components/choices to parent MenuVariant.
     * Called when:
     *   - A MenuItem's is_in_stock status changes (triggered from toggleMenuItemStock)
     *   - A VariantChoiceOption's is_available status changes
     *
     * Logic:
     *   1. If any FIXED component's MenuItem is out of stock / unavailable / archived → variant is out of stock
     *   2. If any REQUIRED ChoiceGroup has ZERO available options → variant is out of stock
     *   3. Otherwise → variant is in stock
     */
    async updateMenuVariantStockStatus(variantId) {
        // 1. Check all FIXED components
        const fixedComponents = await MenuVariantComponent.find({
            variant_id: variantId,
            component_type: 'FIXED',
            menu_item_id: { $ne: null },
        }).lean();

        for (const component of fixedComponents) {
            const item = await MenuItem.findById(component.menu_item_id).lean();
            if (item && (!item.is_in_stock || !item.is_available || item.is_archived)) {
                // A required fixed component is unavailable — variant is out of stock
                await MenuVariant.findByIdAndUpdate(variantId, { is_in_stock: false });
                return false;
            }
        }

        // 2. Check all REQUIRED choice groups — each must have at least one available option
        const requiredGroups = await VariantChoiceGroup.find({
            variant_id: variantId,
            is_required: true,
        }).lean();

        for (const group of requiredGroups) {
            const availableOptionCount = await VariantChoiceOption.countDocuments({
                group_id: group._id,
                is_available: true,
            });

            if (availableOptionCount === 0) {
                // Required group has no selectable options — variant cannot be fulfilled
                await MenuVariant.findByIdAndUpdate(variantId, { is_in_stock: false });
                return false;
            }
        }

        // 3. All checks passed — variant is in stock
        await MenuVariant.findByIdAndUpdate(variantId, { is_in_stock: true });
        return true;
    },
};
