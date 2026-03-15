import VendorMenuSection from '../../model/menu/VendorMenuSection.js';
import MenuItem from '../../model/menu/MenuItem.js';
import MenuItemPortion from '../../model/menu/MenuItemPortion.js';
import { MenuItemChoiceGroup, MenuItemChoiceOption } from '../../model/menu/MenuItemChoice.js';
import { MenuVariant, MenuVariantComponent, VariantChoiceGroup, VariantChoiceOption } from '../../model/menu/MenuVariant.js';
import Category from '../../model/category.model.js';
import Vendor           from "../../model/vendor/vendor.model.js";
import City from "../../model/location/City.js";

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

/**
 * Resolves the delivery fee a customer will be charged for
 * this vendor, using the same logic as the order controller.
 * Returns fee in NAIRA (not kobo).
 */
async function resolveStorefrontDeliveryFee(vendor) {
    // Case 1: vendor manages own delivery
    if (vendor.deliveryManagedBy === "vendor") {
        return vendor.flatRateDeliveryFee ?? 0;
    }

    // Case 2: admin-managed but vendor has a specific override
    if (
        vendor.platformDeliveryFeeOverride != null &&
        vendor.platformDeliveryFeeOverride > 0
    ) {
        return vendor.platformDeliveryFeeOverride;
    }

    // Case 3: fall back to city-level platform fee
    try {
        const cityName = vendor.address?.city;
        if (!cityName) return 0;

        const city = await City.findOne({
            name: { $regex: new RegExp(`^${cityName}$`, "i") }
        }).lean();

        return city?.platformDeliveryFee ?? 0;
    } catch {
        return 0;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/vendors/:vendorId/menu — Full vendor menu grouped by vendor sections
// ─────────────────────────────────────────────────────────────────────────────
export const getFullVendorMenu = async (req, res) => {
    try {
        const { vendorId } = req.params;

        // Step 1 — Fetch the vendor
        const vendor = await Vendor.findById(vendorId).lean();
        if (!vendor) {
            return res.status(404).json({ message: "Vendor not found" });
        }

        // Resolve the fee the customer will actually be charged
        const resolvedDeliveryFee = await resolveStorefrontDeliveryFee(vendor);

        const vendorData = {
            _id:                   vendor._id,
            storeName:             vendor.storeName,
            logo:                  vendor.logo,
            coverImage:            vendor.coverImage || null,
            description:           vendor.storeDescription,
            cuisineTypes:          vendor.cuisineTypes || [],
            address:               vendor.address,
            isOpen:                vendor.isOpen ?? true,
            acceptsDelivery:       vendor.acceptsDelivery ?? true,
            deliveryManagedBy:     vendor.deliveryManagedBy || "admin",
            deliveryFee:           resolvedDeliveryFee,  // ← resolved, not raw field
            estimatedDeliveryTime: vendor.estimatedDeliveryTime ?? 30,
            rating:                vendor.rating ?? null,
            storeSlug:             vendor.storeSlug,
        };

        // Step 2 — Fetch all active combos for this vendor
        const rawCombos = await MenuVariant.find({
            vendor_id:   vendorId,
            is_available: true,
            is_archived:  { $ne: true },
        }).lean();

        // Bulk-fetch ALL components for all combos in one query
        const variantIds = rawCombos.map(v => v._id);

        const [allComponents, allSwapGroups] = await Promise.all([
            MenuVariantComponent.find({
                variant_id: { $in: variantIds }
            }).lean(),
            VariantChoiceGroup.find({
                variant_id: { $in: variantIds }
            }).lean(),
        ]);

        // Bulk-fetch ALL swap options for all swap groups
        const swapGroupIds = allSwapGroups.map(g => g._id);
        const allSwapOptions = await VariantChoiceOption.find({
            group_id: { $in: swapGroupIds }
        }).lean();

        // Collect all unique item IDs across all combo components
        const comboItemIds = [
            ...new Set(
                allComponents.map(c => c.menu_item_id?.toString()).filter(Boolean)
            )
        ];

        // Bulk fetch those items
        const comboItems = await MenuItem.find({
            _id: { $in: comboItemIds }
        }).lean();

        // Build a lookup map: itemId → item
        const comboItemMap = {};
        for (const item of comboItems) {
            comboItemMap[item._id.toString()] = item;
        }

        // Bulk-fetch all choice groups for all component items
        const allComponentChoiceGroups = await MenuItemChoiceGroup.find({
            menu_item_id: { $in: comboItemIds }
        }).sort({ sort_order: 1 }).lean();

        // Collect all group ids for bulk option fetch
        const componentGroupIds = allComponentChoiceGroups.map(g => g._id);

        // Bulk-fetch all options for those groups
        const allComponentChoiceOptions = await MenuItemChoiceOption.find({
            group_id:     { $in: componentGroupIds },
            is_available: { $ne: false },
        }).sort({ sort_order: 1 }).lean();

        // Build options lookup: groupId → options[]
        const componentOptionsByGroup = {};
        for (const opt of allComponentChoiceOptions) {
            const key = opt.group_id.toString();
            if (!componentOptionsByGroup[key]) componentOptionsByGroup[key] = [];
            componentOptionsByGroup[key].push({
                _id:                  opt._id,
                label:                opt.label,
                image_url:            opt.image_url || null,
                price_modifier_naira: Math.round((opt.price_modifier || 0) / 100),
                is_available:         opt.is_available,
            });
        }

        // Build choice groups lookup: itemId → choiceGroups[]
        const componentChoiceGroupsByItem = {};
        for (const group of allComponentChoiceGroups) {
            const key = group.menu_item_id.toString();
            if (!componentChoiceGroupsByItem[key]) componentChoiceGroupsByItem[key] = [];
            componentChoiceGroupsByItem[key].push({
                _id:            group._id,
                name:           group.name,
                is_required:    group.is_required,
                min_selections: group.min_selections,
                max_selections: group.max_selections,
                sort_order:     group.sort_order,
                options:        componentOptionsByGroup[group._id.toString()] || [],
            });
        }

        // Build lookup maps for efficient grouping
        const componentsByVariant = {};
        for (const c of allComponents) {
            const key = c.variant_id.toString();
            if (!componentsByVariant[key]) componentsByVariant[key] = [];
            componentsByVariant[key].push(c);
        }

        const swapGroupsByVariant = {};
        for (const g of allSwapGroups) {
            const key = g.variant_id.toString();
            if (!swapGroupsByVariant[key]) swapGroupsByVariant[key] = [];
            swapGroupsByVariant[key].push(g);
        }

        const swapOptionsByGroup = {};
        for (const o of allSwapOptions) {
            const key = o.group_id.toString();
            if (!swapOptionsByGroup[key]) swapOptionsByGroup[key] = [];
            swapOptionsByGroup[key].push(o);
        }
        // Step 3 — Fetch all active sections for this vendor
        const sections = await VendorMenuSection.find({
            vendor_id:  vendorId,
            deleted_at: null,
        }).sort({ sort_order: 1, createdAt: 1 }).lean();

        // Step 4 — Fetch all visible items for this vendor
        const items = await MenuItem.find({
            vendor_id:   vendorId,
            is_archived: false,
            is_available: true,
        }).sort({ sort_order: 1, createdAt: 1 }).lean();

        const itemIds = items.map(i => i._id);

        const allPortions = await MenuItemPortion.find({
            menu_item_id: { $in: itemIds },
        }).lean();

        // Collect all unique platform category IDs for bulk fetching
        const allCategoryIds = [
            ...new Set([
                ...items.map(i => i.platform_category_id?.toString()),
                ...comboItems.map(i => i.platform_category_id?.toString())
            ].filter(Boolean))
        ];

        const allCategories = await Category.find({
            _id: { $in: allCategoryIds }
        }).populate('parent').lean();

        // Build a category map
        const categoryMap = {};
        allCategories.forEach(cat => {
            categoryMap[cat._id.toString()] = {
                id: cat._id,
                name: cat.name,
                slug: cat.slug,
                parent: cat.parent ? { id: cat.parent._id, name: cat.parent.name, slug: cat.parent.slug } : null
            };
        });

        // Build a map: itemId → portions array
        const portionsByItem = {};
        for (const p of allPortions) {
            const key = p.menu_item_id.toString();
            if (!portionsByItem[key]) portionsByItem[key] = [];
            portionsByItem[key].push(p);
        }

        // Build final combos array
        const combos = rawCombos.map(variant => {
            const vid = variant._id.toString();

            const components = (componentsByVariant[vid] || []).map(c => {
                const item    = comboItemMap[c.menu_item_id?.toString()];
                const itemId  = c.menu_item_id?.toString();
                return {
                    _id:            c._id,
                    menu_item_id:   c.menu_item_id,
                    quantity:       c.quantity || 1,
                    component_type: c.component_type,
                    name:           item?.name      || "Item",
                    image_url:      item?.image_url || null,
                    // Choice groups for this component item.
                    // Empty array = no customisation for this component.
                    choice_groups:  componentChoiceGroupsByItem[itemId] || [],
                };
            });

            const swap_groups = (swapGroupsByVariant[vid] || []).map(group => ({
                _id:         group._id,
                name:        group.name,
                is_required: group.is_required,
                options: (swapOptionsByGroup[group._id.toString()] || []).map(opt => ({
                    _id:                  opt._id,
                    label:                opt.label,
                    price_modifier_naira: Math.round((opt.price_modifier || 0) / 100),
                    menu_item_id:         opt.menu_item_id || null,
                    portion_id:           opt.portion_id   || null,
                })),
            }));

            return {
                _id:               variant._id,
                name:              variant.name,
                description:       variant.description || null,
                image_url:         variant.image_url   || null,
                price_naira:       Math.round(variant.price / 100),
                is_available:      variant.is_available,
                prep_time_minutes: variant.prep_time_minutes || null,
                tags:              variant.tags || [],
                components: components.map(c => {
                    const item = comboItemMap[c.menu_item_id?.toString()];
                    return {
                        ...c,
                        platform_category: item?.platform_category_id ? categoryMap[item.platform_category_id.toString()] : null
                    };
                }),
                swap_groups,
            };
        });


        const enrichedItems = items.map(item => {
            const portions = portionsByItem[item._id.toString()] || [];
            const prices   = portions.map(p => p.price); // kobo
            const defPortion = portions.find(p => p.is_default) || portions[0];

            return {
                _id:              item._id,
                name:             item.name,
                description:      item.description,
                image_url:        item.image_url,
                item_type:        item.item_type,
                dietary_type:     item.dietary_type,
                is_available:     item.is_available,
                is_in_stock:      item.is_in_stock,
                prep_time_minutes: item.prep_time_minutes,
                tags:             item.tags,
                vendor_section_id: item.vendor_section_id,
                platform_category: item.platform_category_id ? categoryMap[item.platform_category_id.toString()] : null,
                portions: {
                    count:                portions.length,
                    default_price_naira:  defPortion
                        ? Math.round(defPortion.price / 100)
                        : 0,
                    min_price_naira: prices.length
                        ? Math.round(Math.min(...prices) / 100)
                        : 0,
                    max_price_naira: prices.length
                        ? Math.round(Math.max(...prices) / 100)
                        : 0,
                },
            };
        });

        // Step 5 — Group items into sections
        const sectionMap = {};
        for (const s of sections) {
            sectionMap[s._id.toString()] = { ...s, items: [] };
        }

        const unsectioned = [];

        for (const item of enrichedItems) {
            const sid = item.vendor_section_id?.toString();
            if (sid && sectionMap[sid]) {
                sectionMap[sid].items.push(item);
            } else {
                unsectioned.push(item);
            }
        }

        const populatedSections = sections
            .map(s => sectionMap[s._id.toString()])
            .filter(s => s.items.length > 0); // hide empty sections

        // Step 6 — Return the response
        return res.status(200).json({
            success:    true,
            vendor:     vendorData,
            combos,
            sections:   populatedSections,
            unsectioned,
        });

    } catch (error) {
        console.error("getFullVendorMenu error:", error);
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
