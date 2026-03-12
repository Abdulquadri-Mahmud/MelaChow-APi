import mongoose from 'mongoose';
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
            image_url, item_type, dietary_type, sort_order, prep_time_minutes, tags,
        } = req.body;
        const vendor_id = req.vendor._id;

        const VALID_ITEM_TYPES = ["FOOD", "DRINK", "SIDE", "PROTEIN", "SWALLOW", "SOUP", "DESSERT", "OTHER"];
        const VALID_DIETARY_TYPES = ["veg", "non-veg", "vegan", "halal", "kosher", "mixed"];

        if (item_type && !VALID_ITEM_TYPES.includes(item_type)) {
            return res.status(400).json({
                success: false,
                message: `item_type "${item_type}" is not valid. Must be one of: ${VALID_ITEM_TYPES.join(", ")}`,
            });
        }

        if (dietary_type && !VALID_DIETARY_TYPES.includes(dietary_type)) {
            return res.status(400).json({
                success: false,
                message: `dietary_type "${dietary_type}" is not valid. Must be one of: ${VALID_DIETARY_TYPES.join(", ")}`,
            });
        }

        // Validate: must be a leaf category
        await MenuService.ensureLeafCategory(platform_category_id);

        const item = await MenuItem.create({
            vendor_id, platform_category_id,
            vendor_section_id: vendor_section_id || null,
            name: name.trim(),
            description: description || null,
            image_url: image_url || null,
            item_type: item_type || "FOOD",
            dietary_type: dietary_type || "mixed",
            sort_order: sort_order || 0,
            prep_time_minutes: prep_time_minutes || null,
            tags: tags || [],
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
        const { platform_category_id, name, description, image_url, item_type, dietary_type, prep_time_minutes, tags, sort_order, vendor_section_id } = req.body;

        const VALID_ITEM_TYPES = ["FOOD", "DRINK", "SIDE", "PROTEIN", "SWALLOW", "SOUP", "DESSERT", "OTHER"];
        const VALID_DIETARY_TYPES = ["veg", "non-veg", "vegan", "halal", "kosher", "mixed"];

        if (item_type && !VALID_ITEM_TYPES.includes(item_type)) {
            return res.status(400).json({
                success: false,
                message: `item_type "${item_type}" is not valid.`,
            });
        }

        if (dietary_type && !VALID_DIETARY_TYPES.includes(dietary_type)) {
            return res.status(400).json({
                success: false,
                message: `dietary_type "${dietary_type}" is not valid.`,
            });
        }

        const updateFields = {};
        if (name !== undefined) updateFields.name = name.trim();
        if (description !== undefined) updateFields.description = description;
        if (image_url !== undefined) updateFields.image_url = image_url;
        if (item_type !== undefined) updateFields.item_type = item_type;
        if (dietary_type !== undefined) updateFields.dietary_type = dietary_type;
        if (prep_time_minutes !== undefined) updateFields.prep_time_minutes = prep_time_minutes;
        if (tags !== undefined) updateFields.tags = tags;
        if (sort_order !== undefined) updateFields.sort_order = sort_order;
        if (vendor_section_id !== undefined) updateFields.vendor_section_id = vendor_section_id;

        // If reassigning category, validate it's a leaf
        if (platform_category_id) {
            await MenuService.ensureLeafCategory(platform_category_id);
            updateFields.platform_category_id = platform_category_id;
        }

        const item = await MenuItem.findOneAndUpdate({ _id: itemId, vendor_id }, updateFields, { new: true });
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        res.status(200).json({ success: true, item });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const toggleMenuItemAvailability = async (req, res) => {
    try {
        const { vendorId, itemId } = req.params;

        // ── GUARD 1: vendorAuth must have attached req.vendor ──
        if (!req.vendor || !req.vendor._id) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized — vendor not authenticated",
            });
        }

        // ── GUARD 2: Ownership check ───────────────────────────
        if (req.vendor._id.toString() !== vendorId) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        // ── GUARD 3: Validate itemId is a valid ObjectId ───────
        if (!mongoose.Types.ObjectId.isValid(itemId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid item ID",
            });
        }

        // ── FETCH ──────────────────────────────────────────────
        const item = await MenuItem.findOne({
            _id: itemId,
            vendor_id: vendorId,
        });

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Menu item not found",
            });
        }

        // ── GUARD 4: Cannot enable an archived item ────────────
        if (item.is_archived) {
            return res.status(400).json({
                success: false,
                message: "Restore this item from archive before making it available",
            });
        }

        // ── TOGGLE ─────────────────────────────────────────────
        item.is_available = !item.is_available;
        await item.save();

        return res.status(200).json({
            success: true,
            message: item.is_available
                ? "Item is now visible on your menu"
                : "Item is now hidden from your menu",
            item: {
                _id: item._id,
                is_available: item.is_available,
                is_archived: item.is_archived,
            },
        });

    } catch (error) {
        console.error("[toggleMenuItemAvailability] error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to toggle availability",
            ...(process.env.NODE_ENV === "development" && {
                detail: error.message
            }),
        });
    }
};

export const setMenuItemArchiveStatus = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { archived } = req.body;
        const vendor_id = req.vendor._id;

        if (typeof archived !== 'boolean') {
            return res.status(400).json({ success: false, message: 'archived must be boolean' });
        }

        // Only block archiving — restoring is always allowed
        if (archived === true) {
            // Find all active combos that reference this item
            const comboComponents = await MenuVariantComponent.find({
                menu_item_id: itemId,
            }).lean();

            if (comboComponents.length > 0) {
                // Get the combo names for a useful error message
                const variantIds = comboComponents.map(c => c.variant_id);

                const combos = await MenuVariant.find({
                    _id: { $in: variantIds },
                    is_archived: { $ne: true },
                })
                    .select("name")
                    .lean();

                if (combos.length > 0) {
                    const comboNames = combos.map(c => `"${c.name}"`).join(", ");
                    return res.status(400).json({
                        success: false,
                        message: `This item is part of ${combos.length === 1 ? "a combo" : "combos"}: ${comboNames}. Archive or remove those combos first, or remove this item from them.`,
                        combo_count: combos.length,
                        combos: combos.map(c => ({ _id: c._id, name: c.name })),
                    });
                }
            }
        }

        const item = await MenuItem.findOne({ _id: itemId, vendor_id });
        if (!item) return res.status(404).json({ success: false, message: 'Menu item not found' });

        // Idempotency check
        if (item.is_archived === archived) {
            return res.status(200).json({
                success: true,
                message: archived ? 'Item is already archived' : 'Item is already active',
                item
            });
        }

        const updateFields = { is_archived: archived };
        // If archiving, automatically hide it too
        if (archived) {
            updateFields.is_available = false;
        }

        const updatedItem = await MenuItem.findByIdAndUpdate(itemId, updateFields, { new: true });

        res.status(200).json({
            success: true,
            message: archived ? 'Item archived successfully' : 'Item restored successfully',
            item: updatedItem
        });
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

export const createVariantChoiceGroup = async (req, res) => {
    try {
        const { variantId } = req.params;
        const { name, min_selections, max_selections, is_required, sort_order } = req.body;
        const vendor_id = req.vendor._id;

        // Ownership guard
        const variant = await MenuVariant.findOne({
            _id: variantId,
            vendor_id,
        });

        if (!variant) {
            return res.status(404).json({
                success: false,
                message: "Variant not found",
            });
        }

        if (!name || !name.trim()) {
            return res.status(400).json({
                success: false,
                message: "name is required",
            });
        }

        const group = await VariantChoiceGroup.create({
            variant_id: variantId,
            name: name.trim(),
            min_selections: min_selections ?? 1,
            max_selections: max_selections ?? 1,
            is_required: is_required !== false,
            sort_order: sort_order || 0,
        });

        return res.status(201).json({
            success: true,
            group,
        });

    } catch (error) {
        console.error("[createVariantChoiceGroup] error:", error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const createVariantChoiceOption = async (req, res) => {
    try {
        const { groupId } = req.params;
        const {
            label,
            menu_item_id,     // which item this option swaps in
            price_modifier,   // price delta in kobo (can be 0)
            is_available,
            sort_order,
        } = req.body;
        const vendor_id = req.vendor._id;

        if (!label || !label.trim()) {
            return res.status(400).json({
                success: false,
                message: "label is required",
            });
        }

        // Verify the group exists and belongs to this vendor's variant
        const group = await VariantChoiceGroup.findById(groupId).lean();
        if (!group) {
            return res.status(404).json({
                success: false,
                message: "Choice group not found",
            });
        }

        // Verify vendor owns the variant this group belongs to
        const variant = await MenuVariant.findOne({
            _id: group.variant_id,
            vendor_id,
        });

        if (!variant) {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        const option = await VariantChoiceOption.create({
            group_id: groupId,
            label: label.trim(),
            menu_item_id: menu_item_id || null,
            price_modifier: Number(price_modifier) || 0,
            is_available: is_available !== false,
            sort_order: sort_order || 0,
        });

        return res.status(201).json({
            success: true,
            option,
        });

    } catch (error) {
        console.error("[createVariantChoiceOption] error:", error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
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

export const updateMenuItemChoiceGroup = async (req, res) => {
    try {
        const { itemId, groupId } = req.params;
        const vendor_id = req.vendor._id;
        const { name, min_selections, max_selections, is_required, sort_order } = req.body;

        // Verify item ownership
        const item = await MenuItem.findOne({ _id: itemId, vendor_id });
        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Item not found",
            });
        }

        // Build update fields — only update what was sent
        const updateFields = {};
        if (name !== undefined) updateFields.name = name.trim();
        if (min_selections !== undefined) updateFields.min_selections = min_selections;
        if (max_selections !== undefined) updateFields.max_selections = max_selections;
        if (is_required !== undefined) updateFields.is_required = is_required;
        if (sort_order !== undefined) updateFields.sort_order = sort_order;

        const group = await MenuItemChoiceGroup.findOneAndUpdate(
            { _id: groupId, menu_item_id: itemId },
            updateFields,
            { new: true }
        );

        if (!group) {
            return res.status(404).json({
                success: false,
                message: "Choice group not found",
            });
        }

        return res.status(200).json({
            success: true,
            group,
        });

    } catch (error) {
        console.error("[updateMenuItemChoiceGroup] error:", error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

export const addMenuItemChoiceOption = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { label, price_modifier_naira, image_url, is_available, sort_order } = req.body;

        if (!label || !label.trim()) {
            return res.status(400).json({ success: false, message: 'label is required' });
        }

        // Validate image_url format if provided
        if (image_url && image_url.trim()) {
            try {
                new URL(image_url.trim());
            } catch {
                return res.status(400).json({
                    success: false,
                    message: 'image_url must be a valid URL',
                });
            }
        }

        const option = await MenuItemChoiceOption.create({
            group_id: groupId,
            label: label.trim(),
            price_modifier: Math.round(Number(price_modifier_naira || 0) * 100), // Naira → kobo
            image_url: image_url?.trim() || null,
            is_available: is_available !== false,
            sort_order: sort_order || 0,
        });

        res.status(201).json({
            success: true,
            option: {
                ...option.toObject(),
                price_modifier_naira: option.price_modifier / 100,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateMenuItemChoiceOption = async (req, res) => {
    try {
        const { optionId } = req.params;
        const { label, price_modifier_naira, image_url, is_available, sort_order } = req.body;

        const updateFields = {};

        if (label !== undefined) updateFields.label = label.trim();
        if (price_modifier_naira !== undefined) {
            updateFields.price_modifier = Math.round(Number(price_modifier_naira) * 100);
        }
        if (is_available !== undefined) updateFields.is_available = is_available;
        if (sort_order !== undefined) updateFields.sort_order = sort_order;

        if (image_url !== undefined) {
            if (image_url && image_url.trim()) {
                try {
                    new URL(image_url.trim());
                } catch {
                    return res.status(400).json({
                        success: false,
                        message: 'image_url must be a valid URL',
                    });
                }
            }
            updateFields.image_url = image_url?.trim() || null;
        }

        const option = await MenuItemChoiceOption.findByIdAndUpdate(
            optionId,
            updateFields,
            { new: true }
        );

        if (!option) return res.status(404).json({ success: false, message: 'Option not found' });

        res.status(200).json({
            success: true,
            option: {
                ...option.toObject(),
                price_modifier_naira: option.price_modifier / 100,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};


// =====================================================================
// DELETE OPERATIONS
// =====================================================================

// ─── DELETE MenuItem (with combo guard + full cascade) ───────────────────────
export const deleteMenuItem = async (req, res) => {
    try {
        const { itemId } = req.params;
        const vendor_id = req.vendor._id;

        if (!mongoose.Types.ObjectId.isValid(itemId)) {
            return res.status(400).json({ success: false, message: 'Invalid item ID' });
        }

        // 1. Ownership check
        const item = await MenuItem.findOne({ _id: itemId, vendor_id }).lean();
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        // 2. Combo membership guard — block if item is a component of an active combo
        const comboComponents = await MenuVariantComponent.find({ menu_item_id: itemId }).lean();
        if (comboComponents.length > 0) {
            const variantIds = comboComponents.map(c => c.variant_id);
            const activeCombos = await MenuVariant.find({
                _id: { $in: variantIds },
                is_archived: { $ne: true },
            }).select('name').lean();

            if (activeCombos.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `This item is part of ${activeCombos.length === 1 ? 'a combo' : 'combos'}: ${activeCombos.map(c => `"${c.name}"`).join(', ')}. Remove it from those combos first.`,
                    combo_count: activeCombos.length,
                    combos: activeCombos.map(c => ({ _id: c._id, name: c.name })),
                });
            }
        }

        // 3. Cascade delete all sub-documents
        const groupIds = (await MenuItemChoiceGroup.find({ menu_item_id: itemId }).select('_id').lean()).map(g => g._id);

        await Promise.all([
            MenuItemPortion.deleteMany({ menu_item_id: itemId }),
            MenuItemChoiceOption.deleteMany({ group_id: { $in: groupIds } }),
            MenuItemChoiceGroup.deleteMany({ menu_item_id: itemId }),
            MenuVariantComponent.deleteMany({ menu_item_id: itemId }), // archived combo refs
            MenuItem.findByIdAndDelete(itemId),
        ]);

        return res.status(200).json({ success: true, message: 'Item and all associated data deleted' });

    } catch (error) {
        console.error('[deleteMenuItem] error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─── DELETE MenuItemPortion (with last-portion guard + default promotion) ─────
export const deleteMenuItemPortion = async (req, res) => {
    try {
        const { itemId, portionId } = req.params;
        const vendor_id = req.vendor._id;

        // Ownership check via the parent item
        const item = await MenuItem.findOne({ _id: itemId, vendor_id }).lean();
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        const portion = await MenuItemPortion.findOne({ _id: portionId, menu_item_id: itemId }).lean();
        if (!portion) return res.status(404).json({ success: false, message: 'Portion not found' });

        // Guard: must always have at least one portion (price tier)
        const portionCount = await MenuItemPortion.countDocuments({ menu_item_id: itemId });
        if (portionCount <= 1) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete the last portion. An item must have at least one price.',
            });
        }

        await MenuItemPortion.findByIdAndDelete(portionId);

        // If we deleted the default portion, promote the next one (lowest sort_order)
        if (portion.is_default) {
            const next = await MenuItemPortion.findOne({ menu_item_id: itemId }).sort('sort_order').lean();
            if (next) {
                await MenuItemPortion.findByIdAndUpdate(next._id, { is_default: true });
            }
        }

        return res.status(200).json({ success: true, message: 'Portion deleted' });

    } catch (error) {
        console.error('[deleteMenuItemPortion] error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─── DELETE MenuItemChoiceGroup (cascades all its options) ────────────────────
export const deleteMenuItemChoiceGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const vendor_id = req.vendor._id;

        const group = await MenuItemChoiceGroup.findById(groupId).lean();
        if (!group) return res.status(404).json({ success: false, message: 'Choice group not found' });

        // Verify vendor owns the parent item
        const item = await MenuItem.findOne({ _id: group.menu_item_id, vendor_id }).lean();
        if (!item) return res.status(403).json({ success: false, message: 'Access denied' });

        // Cascade — delete all options in this group first
        await MenuItemChoiceOption.deleteMany({ group_id: groupId });
        await MenuItemChoiceGroup.findByIdAndDelete(groupId);

        return res.status(200).json({ success: true, message: 'Choice group and all its options deleted' });

    } catch (error) {
        console.error('[deleteMenuItemChoiceGroup] error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─── DELETE MenuItemChoiceOption (single option only) ────────────────────────
export const deleteMenuItemChoiceOption = async (req, res) => {
    try {
        const { optionId } = req.params;
        const vendor_id = req.vendor._id;

        const option = await MenuItemChoiceOption.findById(optionId).lean();
        if (!option) return res.status(404).json({ success: false, message: 'Choice option not found' });

        // Verify vendor owns the parent item via the group
        const group = await MenuItemChoiceGroup.findById(option.group_id).lean();
        if (!group) return res.status(404).json({ success: false, message: 'Parent group not found' });

        const item = await MenuItem.findOne({ _id: group.menu_item_id, vendor_id }).lean();
        if (!item) return res.status(403).json({ success: false, message: 'Access denied' });

        await MenuItemChoiceOption.findByIdAndDelete(optionId);

        return res.status(200).json({ success: true, message: 'Choice option deleted' });

    } catch (error) {
        console.error('[deleteMenuItemChoiceOption] error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// ─── DELETE MenuVariantComponent (min-component guard) ───────────────────────
export const deleteMenuVariantComponent = async (req, res) => {
    try {
        const { variantId, componentId } = req.params;
        const vendor_id = req.vendor._id;

        // Ownership check
        const variant = await MenuVariant.findOne({ _id: variantId, vendor_id }).lean();
        if (!variant) return res.status(404).json({ success: false, message: 'Combo not found' });

        const component = await MenuVariantComponent.findOne({ _id: componentId, variant_id: variantId }).lean();
        if (!component) return res.status(404).json({ success: false, message: 'Component not found' });

        // Guard: combo must retain at least 2 components
        const componentCount = await MenuVariantComponent.countDocuments({ variant_id: variantId });
        if (componentCount <= 2) {
            return res.status(400).json({
                success: false,
                message: 'A combo must have at least 2 items. Remove or replace one of the other components first.',
            });
        }

        await MenuVariantComponent.findByIdAndDelete(componentId);

        return res.status(200).json({ success: true, message: 'Component removed from combo' });

    } catch (error) {
        console.error('[deleteMenuVariantComponent] error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// =====================================================================
// VENDOR CATALOGUE MANAGEMENT
// =====================================================================

export const getVendorMenuItems = async (req, res) => {
    try {
        const vendorId = req.vendor._id;

        // Security: Ensure vendorId param matches authenticated vendor
        if (req.params.vendorId !== req.vendor._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "Access denied. You can only view your own menu items.",
            });
        }

        // ── QUERY PARAMS ─────────────────────────────────────
        const {
            section,        // filter by vendor_section_id (optional)
            category,       // filter by platform_category_id (optional)
            status,         // "active" | "archived" | "all" (default: "all")
            search,         // name search (optional)
            page = 1,
            limit = 50,
        } = req.query;

        // ── BUILD FILTER ─────────────────────────────────────
        const filter = { vendor_id: vendorId };

        // Status filter
        if (status === "active") {
            filter.is_archived = false;
        } else if (status === "archived") {
            filter.is_archived = true;
        }
        // status === "all" or undefined → no is_archived filter

        // Section filter
        if (section) {
            filter.vendor_section_id = section;
        }

        // Category filter
        if (category) {
            filter.platform_category_id = category;
        }

        // Name search — case-insensitive partial match
        if (search && search.trim()) {
            filter.name = { $regex: search.trim(), $options: "i" };
        }

        // ── PAGINATION ───────────────────────────────────────
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const skip = (pageNum - 1) * limitNum;

        // ── FETCH ITEMS ──────────────────────────────────────
        const [items, total] = await Promise.all([
            MenuItem.find(filter)
                .sort({ is_archived: 1, sort_order: 1, createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .populate("platform_category_id", "name slug")
                .populate("vendor_section_id", "name")
                .lean(),
            MenuItem.countDocuments(filter),
        ]);

        if (items.length === 0) {
            return res.status(200).json({
                success: true,
                items: [],
                pagination: {
                    total: 0,
                    page: pageNum,
                    limit: limitNum,
                    pages: 0,
                    hasMore: false,
                },
            });
        }

        // ── ENRICH WITH COUNTS ───────────────────────────────
        // Fetch portion counts and choice group counts in bulk.
        const itemIds = items.map(i => i._id);

        const [portionCounts, choiceGroupCounts, comboMemberships] = await Promise.all([
            // Count portions per item
            MenuItemPortion.aggregate([
                {
                    $match: {
                        menu_item_id: { $in: itemIds }
                        // deleted_at: null // Assuming portions don't have soft deletes yet, or add if needed
                    }
                },
                {
                    $group: {
                        _id: "$menu_item_id",
                        count: { $sum: 1 },
                        // Pull default portion price for display
                        default_price: {
                            $max: {
                                $cond: [
                                    { $eq: ["$is_default", true] },
                                    "$price",
                                    null
                                ]
                            }
                        },
                        min_price: { $min: "$price" },
                        max_price: { $max: "$price" },
                    }
                }
            ]),

            // Count choice groups per item
            MenuItemChoiceGroup.aggregate([
                {
                    $match: {
                        menu_item_id: { $in: itemIds }
                    }
                },
                {
                    $group: {
                        _id: "$menu_item_id",
                        count: { $sum: 1 },
                    }
                }
            ]),

            // Find all combo memberships for this vendor's items
            MenuVariantComponent.aggregate([
                {
                    $match: {
                        menu_item_id: { $in: itemIds },
                    }
                },
                {
                    $lookup: {
                        from: "menuvariants",
                        localField: "variant_id",
                        foreignField: "_id",
                        as: "variant",
                    }
                },
                { $unwind: "$variant" },
                {
                    $match: {
                        "variant.is_archived": { $ne: true },
                    }
                },
                {
                    $group: {
                        _id: "$menu_item_id",
                        combos: {
                            $push: {
                                _id: "$variant._id",
                                name: "$variant.name",
                                price: "$variant.price",
                            }
                        }
                    }
                }
            ]),
        ]);

        // Index counts by item _id for O(1) lookup
        const portionMap = {};
        const choiceGroupMap = {};
        const comboMembershipMap = {};

        portionCounts.forEach(p => {
            portionMap[p._id.toString()] = {
                count: p.count,
                default_price: p.default_price,
                min_price: p.min_price,
                max_price: p.max_price,
            };
        });

        choiceGroupCounts.forEach(c => {
            choiceGroupMap[c._id.toString()] = c.count;
        });

        comboMemberships.forEach(m => {
            comboMembershipMap[m._id.toString()] = m.combos;
        });

        // ── SHAPE RESPONSE ───────────────────────────────────
        const shaped = items.map(item => {
            const idStr = item._id.toString();
            const portions = portionMap[idStr] || { count: 0, default_price: null, min_price: null, max_price: null };
            const cgCount = choiceGroupMap[idStr] || 0;

            return {
                _id: item._id,
                name: item.name,
                description: item.description,
                image_url: item.image_url,
                item_type: item.item_type,
                dietary_type: item.dietary_type,
                is_available: item.is_available,
                is_in_stock: item.is_in_stock,
                is_archived: item.is_archived,
                sort_order: item.sort_order,
                prep_time_minutes: item.prep_time_minutes,
                tags: item.tags,
                createdAt: item.createdAt,
                updatedAt: item.updatedAt,

                // Populated relations — flattened for frontend convenience
                category: item.platform_category_id
                    ? {
                        _id: item.platform_category_id._id,
                        name: item.platform_category_id.name,
                        slug: item.platform_category_id.slug,
                    }
                    : null,
                section: item.vendor_section_id
                    ? {
                        _id: item.vendor_section_id._id,
                        name: item.vendor_section_id.name,
                    }
                    : null,

                // Counts — never full arrays in list endpoint
                portions: {
                    count: portions.count,
                    default_price: portions.default_price,
                    // Convert kobo → naira for display
                    default_price_naira: portions.default_price
                        ? portions.default_price / 100
                        : null,
                    min_price_naira: portions.min_price
                        ? portions.min_price / 100
                        : null,
                    max_price_naira: portions.max_price
                        ? portions.max_price / 100
                        : null,
                },
                choice_groups: {
                    count: cgCount,
                },
                combos: comboMembershipMap[idStr] || [],
            };
        });

        // ── SUMMARY STATS ────────────────────────────────────
        // Useful for the vendor dashboard header cards
        const allItems = await MenuItem.find({ vendor_id: vendorId }).lean();
        const stats = {
            total: allItems.length,
            active: allItems.filter(i => !i.is_archived && i.is_available).length,
            archived: allItems.filter(i => i.is_archived).length,
            out_of_stock: allItems.filter(i => !i.is_in_stock && !i.is_archived).length,
        };

        return res.status(200).json({
            success: true,
            items: shaped,
            stats,
            pagination: {
                total: total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum),
                hasMore: pageNum * limitNum < total,
            },
        });

    } catch (error) {
        console.error("getVendorMenuItems error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch menu items",
        });
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

