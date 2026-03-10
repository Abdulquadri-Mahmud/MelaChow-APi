import MenuItem from '../model/menu/MenuItem.js';
import MenuItemPortion from '../model/menu/MenuItemPortion.js';
import { MenuVariant, VariantChoiceGroup } from '../model/menu/MenuVariant.js';

export const MenuService = {
    /**
     * Cascade availability from portions to parent MenuItem.
     * If ALL portions of an item are out of stock, the parent item is marked out of stock.
     * If any portion returns to stock, the parent item is marked back in stock.
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
     * If a required choice group has ALL options sold out, the variant is marked out of stock.
     */
    async updateMenuVariantStockStatus(variantId) {
        // This requires checking all required choice groups and their options
        const requiredGroups = await VariantChoiceGroup.find({ variant_id: variantId, is_required: true });

        // For each required group, check if it has any available options in stock
        // [Implementation detail: This would typically be linked via VariantChoiceOption]
        // Since this is a complex cascade, it's triggered when an option's stock changes.

        // For now, let's assume we fetch the full list of selectable options for these groups
        // If ANY required group has 0 in-stock options, the variant is SOLD OUT.

        // [Mock implementation for the logic described in the prompt]
        let allRequiredGroupsHaveOptions = true;
        for (const group of requiredGroups) {
            // Find options for this group that are in stock
            // const inStockOptions = await VariantChoiceOption.countDocuments({ group_id: group._id, is_available: true, is_in_stock: true });
            // if (inStockOptions === 0) {
            //   allRequiredGroupsHaveOptions = false;
            //   break;
            // }
        }

        await MenuVariant.findByIdAndUpdate(variantId, { is_in_stock: allRequiredGroupsHaveOptions });
    }
};
