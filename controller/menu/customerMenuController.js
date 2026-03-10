import MenuCategory from '../../model/menu/MenuCategory.js';
import MenuItem from '../../model/menu/MenuItem.js';
import MenuItemPortion from '../../model/menu/MenuItemPortion.js';
import { MenuItemChoiceGroup, MenuItemChoiceOption } from '../../model/menu/MenuItemChoice.js';
import { MenuVariant, MenuVariantComponent, VariantChoiceGroup, VariantChoiceOption } from '../../model/menu/MenuVariant.js';

/**
 * 1. Customer Access to Menu
 */
export const getFullVendorMenu = async (req, res) => {
    try {
        const { vendorId } = req.params;

        // 1. Get Categories
        const categories = await MenuCategory.find({ vendor_id: vendorId, is_visible: true }).sort('sort_order');
        const fullCategories = [];

        for (const cat of categories) {
            // 2. Get Items per Category
            const items = await MenuItem.find({ category_id: cat._id, is_archived: false }).sort('sort_order');
            const fullItems = [];

            for (const item of items) {
                // 3. Get Portions and Choice Groups for each item
                const portions = await MenuItemPortion.find({ menu_item_id: item._id, is_available: true }).sort('sort_order');
                const choiceGroups = await MenuItemChoiceGroup.find({ menu_item_id: item._id }).sort('sort_order');

                const fullChoiceGroups = [];
                for (const group of choiceGroups) {
                    const options = await MenuItemChoiceOption.find({ group_id: group._id, is_available: true }).sort('sort_order');
                    fullChoiceGroups.push({ ...group.toObject(), options });
                }

                fullItems.push({
                    ...item.toObject(),
                    portions,
                    choice_groups: fullChoiceGroups
                });
            }
            fullCategories.push({ ...cat.toObject(), items: fullItems });
        }

        // 4. Get Variants
        const variants = await MenuVariant.find({ vendor_id: vendorId, is_archived: false }).sort('sort_order');
        const fullVariants = [];

        for (const variant of variants) {
            const components = await MenuVariantComponent.find({ variant_id: variant._id }).sort('sort_order');
            const resolvedComponents = [];

            for (const component of components) {
                const resolved = { ...component.toObject() };
                if (component.component_type === 'CHOICE_GROUP') {
                    const group = await VariantChoiceGroup.findById(component.choice_group_id);
                    if (group) {
                        const options = await VariantChoiceOption.find({ group_id: group._id, is_available: true }).sort('sort_order');
                        resolved.choice_group = { ...group.toObject(), options };
                    }
                }
                resolvedComponents.push(resolved);
            }
            fullVariants.push({ ...variant.toObject(), components: resolvedComponents });
        }

        res.status(200).json({ success: true, vendor_id: vendorId, categories: fullCategories, variants: fullVariants });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getMenuItemDetails = async (req, res) => {
    try {
        const { itemId } = req.params;
        const item = await MenuItem.findById(itemId);
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        const portions = await MenuItemPortion.find({ menu_item_id: item._id, is_available: true }).sort('sort_order');
        const choiceGroups = await MenuItemChoiceGroup.find({ menu_item_id: item._id }).sort('sort_order');

        const fullChoiceGroups = [];
        for (const group of choiceGroups) {
            const options = await MenuItemChoiceOption.find({ group_id: group._id, is_available: true }).sort('sort_order');
            fullChoiceGroups.push({ ...group.toObject(), options });
        }

        res.status(200).json({
            success: true,
            item: {
                ...item.toObject(),
                portions,
                choice_groups: fullChoiceGroups
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
