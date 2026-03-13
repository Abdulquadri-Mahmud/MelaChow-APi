import VendorMenuSection from '../../model/menu/VendorMenuSection.js';
import MenuItem from '../../model/menu/MenuItem.js';
import MenuItemPortion from '../../model/menu/MenuItemPortion.js';
import { MenuItemChoiceGroup, MenuItemChoiceOption } from '../../model/menu/MenuItemChoice.js';
import { MenuVariant, MenuVariantComponent, VariantChoiceGroup, VariantChoiceOption } from '../../model/menu/MenuVariant.js';
import Category from '../../model/category.model.js';

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Resolve platform_category with parent populated
// ─────────────────────────────────────────────────────────────────────────────
async function resolvePlatformCategory(categoryId) {
    return Category.findById(categoryId).populate('parent', 'id name slug');
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Build full item object with portions, choice_groups, and platform_category
// ─────────────────────────────────────────────────────────────────────────────
async function buildFullItem(item, { vendorView = false } = {}) {
    const itemId = item._id;

    const [portions, rawGroups, platformCategory, comboComponents] = await Promise.all([
        // Fetch portions — hardware default is filtered by is_available:true for customers
        MenuItemPortion.find({
            menu_item_id: itemId,
            ...(vendorView ? {} : { is_available: true })
        }).sort('sort_order').lean(),

        // Fetch all choice groups for this item
        MenuItemChoiceGroup.find({
            menu_item_id: itemId
        }).sort('sort_order').lean(),

        resolvePlatformCategory(item.platform_category_id),

        // Fetch combo memberships
        MenuVariantComponent.find({
            menu_item_id: itemId,
        }).lean(),
    ]);

    // Fetch options for choice groups in bulk
    let fullChoiceGroups = [];
    if (rawGroups.length > 0) {
        const groupIds = rawGroups.map(g => g._id);
        const optionsFilter = { group_id: { $in: groupIds } };

        // Customers only see available options; vendors see all
        if (!vendorView) {
            optionsFilter.is_available = { $ne: false };
        }

        const allOptions = await MenuItemChoiceOption.find(optionsFilter)
            .sort('sort_order')
            .lean();

        // Index options by group_id for efficient merging
        const optionsByGroup = {};
        allOptions.forEach(opt => {
            const key = opt.group_id.toString();
            if (!optionsByGroup[key]) optionsByGroup[key] = [];
            optionsByGroup[key].push({
                _id: opt._id,
                label: opt.label,
                image_url: opt.image_url || null,
                price_modifier: opt.price_modifier,
                price_modifier_naira: opt.price_modifier / 100,
                is_available: opt.is_available,
                sort_order: opt.sort_order,
            });
        });

        fullChoiceGroups = rawGroups.map(g => ({
            ...g,
            options: optionsByGroup[g._id.toString()] || [],
        }));
    }

    // ── Resolve active combos this item belongs to ───────────────
    const [variants, fullComboComponents] = await Promise.all([
        MenuVariant.find({
            _id: { $in: comboComponents.map(c => c.variant_id) },
            ...(vendorView ? {} : { is_archived: { $ne: true }, is_available: { $ne: false } }),
        }).lean(),
        MenuVariantComponent.find({
            variant_id: { $in: comboComponents.map(c => c.variant_id) }
        }).lean(),
    ]);

    // For each variant, fetch its components and swap groups
    const fullCombos = await Promise.all(
        variants.map(async (variant) => {
            // All FIXED components for this combo
            const components = fullComboComponents.filter(c => c.variant_id.toString() === variant._id.toString());

            // Populate each component's menu item name + image
            const populatedComponents = await Promise.all(
                components.map(async (comp) => {
                    const menuItem = comp.menu_item_id
                        ? await MenuItem.findById(comp.menu_item_id)
                            .select("name image_url")
                            .lean()
                        : null;
                    return {
                        _id:            comp._id,
                        menu_item_id:   comp.menu_item_id,
                        name:           menuItem?.name || comp.label || null,
                        image_url:      menuItem?.image_url || null,
                        quantity:       comp.quantity || 1,
                        component_type: comp.component_type,
                        sort_order:     comp.sort_order,
                    };
                })
            );

            // Swap choice groups for this combo
            const swapGroups = await VariantChoiceGroup.find({
                variant_id: variant._id,
            }).lean();

            const populatedSwapGroups = await Promise.all(
                swapGroups.map(async (group) => {
                    const options = await VariantChoiceOption.find({
                        group_id: group._id,
                    }).lean();

                    return {
                        _id:            group._id,
                        name:           group.name,
                        is_required:    group.is_required,
                        min_selections: group.min_selections,
                        max_selections: group.max_selections,
                        sort_order:     group.sort_order,
                        options: options.map(opt => ({
                            _id:                  opt._id,
                            label:                opt.label,
                            menu_item_id:         opt.menu_item_id,
                            price_modifier:       opt.price_modifier,
                            price_modifier_naira: opt.price_modifier / 100,
                            is_available:         opt.is_available,
                            sort_order:           opt.sort_order,
                        })),
                    };
                })
            );

            return {
                _id:               variant._id,
                name:              variant.name,
                description:       variant.description || null,
                image_url:         variant.image_url || null,
                price:             variant.price,
                price_naira:       variant.price / 100,
                is_available:      variant.is_available,
                is_archived:       variant.is_archived,
                prep_time_minutes: variant.prep_time_minutes || null,
                tags:              variant.tags || [],
                components:        populatedComponents,
                swap_groups:       populatedSwapGroups,
            };
        })
    );

    return {
        ...item,
        dietary_type: item.dietary_type || "mixed",
        platform_category: platformCategory
            ? {
                id: platformCategory._id,
                name: platformCategory.name,
                slug: platformCategory.slug,
                parent: platformCategory.parent
                    ? { id: platformCategory.parent._id, name: platformCategory.parent.name, slug: platformCategory.parent.slug }
                    : null,
            }
            : null,
        portions: portions.map(p => ({
            ...p,
            price_naira: p.price / 100,
        })),
        choice_groups: fullChoiceGroups,
        combos: fullCombos,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Build full variant with components and choice groups
// ─────────────────────────────────────────────────────────────────────────────
async function buildFullVariant(variant) {
    const components = await MenuVariantComponent.find({ variant_id: variant._id }).sort('sort_order').lean();

    const resolvedComponents = await Promise.all(
        components.map(async (component) => {
            if (component.component_type === 'CHOICE_GROUP') {
                const group = await VariantChoiceGroup.findById(component.choice_group_id).lean();
                if (group) {
                    const options = await VariantChoiceOption.find({ group_id: group._id, is_available: true })
                        .sort('sort_order')
                        .lean();
                    return { ...component, choice_group: { ...group, options } };
                }
            }
            return component;
        })
    );

    return { ...variant, components: resolvedComponents };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/vendors/:vendorId/menu — Full vendor menu grouped by vendor sections
// ─────────────────────────────────────────────────────────────────────────────
export const getFullVendorMenu = async (req, res) => {
    try {
        const { vendorId } = req.params;

        // 1. Get all visible vendor sections sorted by sort_order — exclude soft-deleted
        const sections = await VendorMenuSection.find({ vendor_id: vendorId, is_visible: true, deleted_at: null })
            .sort('sort_order')
            .lean();

        // 2. Fetch all non-archived items for this vendor in one query, then group in JS
        const allItems = await MenuItem.find({ vendor_id: vendorId, is_archived: false }).sort('sort_order').lean();

        // 3. Group items into their sections
        const sectionMap = {};
        const unsectionedItems = [];

        for (const item of allItems) {
            const sectionId = item.vendor_section_id ? item.vendor_section_id.toString() : null;
            if (sectionId) {
                if (!sectionMap[sectionId]) sectionMap[sectionId] = [];
                sectionMap[sectionId].push(item);
            } else {
                unsectionedItems.push(item);
            }
        }

        // 4. Build full sections with enriched items
        const fullSections = await Promise.all(
            sections.map(async (section) => {
                const rawItems = sectionMap[section._id.toString()] || [];
                const items = await Promise.all(rawItems.map(buildFullItem));
                return {
                    section_id: section._id,
                    section_name: section.name,
                    sort_order: section.sort_order,
                    is_visible: section.is_visible,
                    items,
                };
            })
        );

        // 5. Virtual "Other" section for unsectioned items
        if (unsectionedItems.length > 0) {
            const otherItems = await Promise.all(unsectionedItems.map(buildFullItem));
            fullSections.push({
                section_id: null,
                section_name: 'Other',
                sort_order: 9999,
                is_visible: true,
                items: otherItems,
            });
        }

        // 6. Fetch all vendor variants
        const rawVariants = await MenuVariant.find({ vendor_id: vendorId, is_archived: false })
            .sort('sort_order')
            .lean();
        const variants = await Promise.all(rawVariants.map(buildFullVariant));

        res.status(200).json({
            success: true,
            vendor_id: vendorId,
            sections: fullSections,
            variants,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/vendors/:vendorId/menu/items/:itemId
// ─────────────────────────────────────────────────────────────────────────────
export const getMenuItemDetails = async (req, res) => {
    try {
        const { itemId } = req.params;
        const item = await MenuItem.findOne({ _id: itemId, is_archived: false }).lean();
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        // Determine if this is a vendor request
        // vendorId in the URL means vendor is viewing their own item
        const isVendorRequest = !!req.params.vendorId;
        const full = await buildFullItem(item, { vendorView: isVendorRequest });
        res.status(200).json({ success: true, item: full });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/vendors/:vendorId/menu/variants/:variantId
// ─────────────────────────────────────────────────────────────────────────────
export const getMenuVariantDetails = async (req, res) => {
    try {
        const { variantId } = req.params;
        const variant = await MenuVariant.findOne({ _id: variantId, is_archived: false }).lean();
        if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });

        const full = await buildFullVariant(variant);
        res.status(200).json({ success: true, variant: full });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// MARKETPLACE DISCOVERY
// GET /v1/marketplace/categories/:categoryId/items — All items across all vendors
// ─────────────────────────────────────────────────────────────────────────────
export const getItemsByPlatformCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const [items, total] = await Promise.all([
            MenuItem.find({
                platform_category_id: categoryId,
                is_archived: false,
                is_available: true,
                is_in_stock: true,
                category_deactivated: false,
            })
                .sort({ sort_order: 1, createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('vendor_id', 'storeName logo address')
                .lean(),
            MenuItem.countDocuments({
                platform_category_id: categoryId,
                is_archived: false,
                is_available: true,
                is_in_stock: true,
                category_deactivated: false,
            }),
        ]);

        // Attach portions to each item.
        // Include sold-out portions (is_in_stock: false) — client renders "Sold Out" badge.
        // Only is_available: false hides a portion tier.
        const fullItems = await Promise.all(
            items.map(async (item) => {
                const portions = await MenuItemPortion.find({ menu_item_id: item._id, is_available: true })
                    .sort('sort_order')
                    .lean();
                return { ...item, dietary_type: item.dietary_type || "mixed", portions };
            })
        );

        res.status(200).json({
            success: true,
            category_id: categoryId,
            items: fullItems,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/marketplace/categories/:categoryId/vendors — Vendors with items in category
// ─────────────────────────────────────────────────────────────────────────────
export const getVendorsByPlatformCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;

        const vendorIds = await MenuItem.distinct('vendor_id', {
            platform_category_id: categoryId,
            is_archived: false,
            is_available: true,
            is_in_stock: true,
            category_deactivated: false,
        });

        res.status(200).json({ success: true, category_id: categoryId, vendor_ids: vendorIds });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
