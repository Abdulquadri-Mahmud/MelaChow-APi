import VendorMenuSection from '../../model/menu/VendorMenuSection.js';
import MenuItem from '../../model/menu/MenuItem.js';
import MenuItemPortion from '../../model/menu/MenuItemPortion.js';
import { MenuItemChoiceGroup, MenuItemChoiceOption } from '../../model/menu/MenuItemChoice.js';
import { MenuVariant, MenuVariantComponent, VariantChoiceGroup, VariantChoiceOption } from '../../model/menu/MenuVariant.js';
import { MenuService } from '../../services/menu.service.js';

// =====================================================================
// VENDOR MENU SECTIONS
// =====================================================================

export const createVendorMenuSection = async (req, res) => {
    try {
        const { name, description, sort_order, is_visible } = req.body;
        const vendor_id = req.vendor._id;
        const section = await VendorMenuSection.create({ vendor_id, name, description, sort_order, is_visible });
        res.status(201).json({ success: true, section });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getVendorMenuSections = async (req, res) => {
    try {
        const vendor_id = req.vendor._id;
        // Exclude soft-deleted sections
        const sections = await VendorMenuSection.find({ vendor_id, deleted_at: null }).sort('sort_order');
        res.status(200).json({ success: true, sections });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateVendorMenuSection = async (req, res) => {
    try {
        const { sectionId } = req.params;
        const vendor_id = req.vendor._id;
        const { name, description, sort_order, is_visible } = req.body;
        const section = await VendorMenuSection.findOneAndUpdate(
            { _id: sectionId, vendor_id, deleted_at: null }, // scope to vendor + not deleted
            { name, description, sort_order, is_visible },
            { new: true }
        );
        if (!section) return res.status(404).json({ success: false, message: 'Section not found' });
        res.status(200).json({ success: true, section });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const deleteVendorMenuSection = async (req, res) => {
    try {
        const { sectionId } = req.params;
        const vendor_id = req.vendor._id;

        // Soft delete — set deleted_at timestamp instead of destroying the record
        const section = await VendorMenuSection.findOneAndUpdate(
            { _id: sectionId, vendor_id, deleted_at: null }, // only if not already deleted
            { deleted_at: new Date(), is_visible: false },
            { new: true }
        );

        if (!section) {
            return res.status(404).json({ success: false, message: 'Section not found' });
        }

        // Nullify vendor_section_id on all items in this section — they fall into "Other"
        await MenuItem.updateMany({ vendor_id, vendor_section_id: sectionId }, { vendor_section_id: null });

        res.status(200).json({ success: true, message: 'Section deleted. Items moved to "Other".' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =====================================================================
// MENU ITEMS
// =====================================================================

export const createMenuItem = async (req, res) => {
    try {
        const {
            platform_category_id, vendor_section_id, name, description,
            image_url, item_type, sort_order, prep_time_minutes, tags,
        } = req.body;
        const vendor_id = req.vendor._id;

        // Validate: must be a leaf category
        await MenuService.ensureLeafCategory(platform_category_id);

        const item = await MenuItem.create({
            vendor_id, platform_category_id, vendor_section_id,
            name, description, image_url, item_type, sort_order, prep_time_minutes, tags,
            is_available: true, is_in_stock: true, is_archived: false,
        });

        res.status(201).json({ success: true, item });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateMenuItem = async (req, res) => {
    try {
        const { itemId } = req.params;
        const vendor_id = req.vendor._id;
        const { platform_category_id, ...rest } = req.body;

        // If reassigning category, validate it's a leaf
        if (platform_category_id) {
            await MenuService.ensureLeafCategory(platform_category_id);
            rest.platform_category_id = platform_category_id;
        }

        const item = await MenuItem.findOneAndUpdate({ _id: itemId, vendor_id }, rest, { new: true });
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        res.status(200).json({ success: true, item });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const toggleMenuItemAvailability = async (req, res) => {
    try {
        const { itemId } = req.params;
        const vendor_id = req.vendor._id;
        const { is_available } = req.body;

        // Cannot mark available if no active portions exist
        if (is_available === true) {
            const activePortion = await MenuItemPortion.findOne({ menu_item_id: itemId, is_available: true });
            if (!activePortion) {
                return res.status(400).json({ success: false, message: 'Cannot activate an item with no portions.' });
            }
        }

        const item = await MenuItem.findOneAndUpdate({ _id: itemId, vendor_id }, { is_available }, { new: true });
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        res.status(200).json({ success: true, item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const toggleMenuItemStock = async (req, res) => {
    try {
        const { itemId } = req.params;
        const vendor_id = req.vendor._id;
        const { is_in_stock } = req.body;

        const item = await MenuItem.findOneAndUpdate({ _id: itemId, vendor_id }, { is_in_stock }, { new: true });
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        // Cascade to any variants that include this item as a FIXED component
        const affectedComponents = await MenuVariantComponent.find({
            menu_item_id: itemId,
            component_type: 'FIXED',
        }).lean();

        const affectedVariantIds = [...new Set(affectedComponents.map(c => c.variant_id.toString()))];

        if (affectedVariantIds.length > 0) {
            await Promise.all(
                affectedVariantIds.map(variantId => MenuService.updateMenuVariantStockStatus(variantId))
            );
        }

        res.status(200).json({ success: true, item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const moveItemToSection = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { vendor_section_id } = req.body;
        const vendor_id = req.vendor._id;

        const item = await MenuItem.findOneAndUpdate(
            { _id: itemId, vendor_id },
            { vendor_section_id: vendor_section_id || null },
            { new: true }
        );
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        res.status(200).json({ success: true, item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =====================================================================
// PORTIONS
// =====================================================================

export const addMenuItemPortion = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { label, price, is_default, max_quantity, sort_order } = req.body;
        const vendor_id = req.vendor._id;

        // Confirm item belongs to this vendor
        const item = await MenuItem.findOne({ _id: itemId, vendor_id });
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        // If setting new default, clear existing one first
        if (is_default) {
            await MenuItemPortion.updateMany({ menu_item_id: itemId }, { is_default: false });
        }

        const portion = await MenuItemPortion.create({
            menu_item_id: itemId, label, price, is_default: !!is_default,
            max_quantity, sort_order, is_available: true, is_in_stock: true,
        });

        // Cascade: update parent item stock status after new portion is added
        await MenuService.updateMenuItemStockStatus(itemId);

        res.status(201).json({ success: true, portion });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateMenuItemPortion = async (req, res) => {
    try {
        const { itemId, portionId } = req.params;
        const vendor_id = req.vendor._id;

        // Ensure the item belongs to this vendor
        const item = await MenuItem.findOne({ _id: itemId, vendor_id });
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        const portion = await MenuItemPortion.findOneAndUpdate(
            { _id: portionId, menu_item_id: itemId },
            req.body,
            { new: true }
        );
        if (!portion) return res.status(404).json({ success: false, message: 'Portion not found' });

        // Cascade stock if is_in_stock changed
        if (req.body.is_in_stock !== undefined) {
            await MenuService.updateMenuItemStockStatus(itemId);
        }

        res.status(200).json({ success: true, portion });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const togglePortionStock = async (req, res) => {
    try {
        const { itemId, portionId } = req.params;
        const { is_in_stock } = req.body;
        const vendor_id = req.vendor._id;

        const item = await MenuItem.findOne({ _id: itemId, vendor_id });
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        const portion = await MenuItemPortion.findOneAndUpdate(
            { _id: portionId, menu_item_id: itemId },
            { is_in_stock },
            { new: true }
        );
        if (!portion) return res.status(404).json({ success: false, message: 'Portion not found' });

        // Cascade: if all portions are out of stock, mark parent item out of stock
        await MenuService.updateMenuItemStockStatus(itemId);

        res.status(200).json({ success: true, portion });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =====================================================================
// VARIANTS
// =====================================================================

export const createMenuVariant = async (req, res) => {
    try {
        const { name, description, image_url, price, sort_order, prep_time_minutes, tags } = req.body;
        const vendor_id = req.vendor._id;
        const variant = await MenuVariant.create({
            vendor_id, name, description, image_url, price, sort_order, prep_time_minutes, tags,
            is_available: false, // Cannot be available until components are added
            is_in_stock: true, is_archived: false,
        });
        res.status(201).json({ success: true, variant });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateMenuVariant = async (req, res) => {
    try {
        const { variantId } = req.params;
        const vendor_id = req.vendor._id;
        const variant = await MenuVariant.findOneAndUpdate({ _id: variantId, vendor_id }, req.body, { new: true });
        if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });
        res.status(200).json({ success: true, variant });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const addMenuVariantComponent = async (req, res) => {
    try {
        const { variantId } = req.params;
        const { component_type, menu_item_id, portion_id, quantity, label, choice_group_id, sort_order } = req.body;
        const vendor_id = req.vendor._id;

        const variant = await MenuVariant.findOne({ _id: variantId, vendor_id });
        if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });

        const component = await MenuVariantComponent.create({
            variant_id: variantId, component_type, menu_item_id, portion_id,
            quantity, label, choice_group_id, sort_order,
        });

        res.status(201).json({ success: true, component });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const toggleVariantAvailability = async (req, res) => {
    try {
        const { variantId } = req.params;
        const { is_available } = req.body;
        const vendor_id = req.vendor._id;

        const variant = await MenuVariant.findOne({ _id: variantId, vendor_id });
        if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });

        // Cannot activate a variant with zero components
        if (is_available === true) {
            const componentCount = await MenuVariantComponent.countDocuments({ variant_id: variantId });
            if (componentCount === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot activate a variant with no components.',
                });
            }
        }

        variant.is_available = is_available;
        await variant.save();

        res.status(200).json({ success: true, variant });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =====================================================================
// CHOICE GROUPS (item-level add-ons)
// =====================================================================

export const addMenuItemChoiceGroup = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { name, min_selections, max_selections, is_required, sort_order } = req.body;
        const vendor_id = req.vendor._id;

        const item = await MenuItem.findOne({ _id: itemId, vendor_id });
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        const group = await MenuItemChoiceGroup.create({
            menu_item_id: itemId, name, min_selections, max_selections, is_required, sort_order,
        });

        res.status(201).json({ success: true, group });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const addMenuItemChoiceOption = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { label, price_modifier, is_available, sort_order } = req.body;

        const option = await MenuItemChoiceOption.create({
            group_id: groupId, label, price_modifier, is_available, sort_order,
        });

        res.status(201).json({ success: true, option });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =====================================================================
// PLATFORM CATEGORIES — read only for vendors
// =====================================================================
export const getPlatformCategories = async (req, res) => {
    // Proxy through to the existing Category model
    try {
        const Category = (await import('../../model/category.model.js')).default;
        const categories = await Category.find({ isActive: true }).populate('parent', 'name slug').sort('name').lean();
        res.status(200).json({ success: true, categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
