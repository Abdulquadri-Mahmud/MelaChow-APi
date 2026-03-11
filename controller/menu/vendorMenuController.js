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
        const { itemId } = req.params;
        const vendor_id = req.vendor._id;
        const { is_available } = req.body;

        const item = await MenuItem.findOne({ _id: itemId, vendor_id });
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        // Guard: Cannot toggle availability if archived
        if (item.is_archived && is_available !== false) {
            return res.status(400).json({
                success: false,
                message: "Cannot change availability of an archived item. Restore from archive first."
            });
        }

        // Cannot mark available if no active portions exist
        if (is_available === true) {
            const activePortion = await MenuItemPortion.findOne({ menu_item_id: itemId, is_available: true });
            if (!activePortion) {
                return res.status(400).json({ success: false, message: 'Cannot activate an item with no portions.' });
            }
        }

        item.is_available = is_available;
        await item.save();

        res.status(200).json({ success: true, item });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
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

        const [portionCounts, choiceGroupCounts] = await Promise.all([
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
        ]);

        // Index counts by item _id for O(1) lookup
        const portionMap = {};
        const choiceGroupMap = {};

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

