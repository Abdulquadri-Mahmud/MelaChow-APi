import ComboItem from '../../model/menu/ComboItem.js';
import MenuItem from '../../model/menu/MenuItem.js';
import MenuItemPortion from '../../model/menu/MenuItemPortion.js';
import { MenuItemChoiceGroup, MenuItemChoiceOption } from '../../model/menu/MenuItemChoice.js';
import VendorMenuSection from '../../model/menu/VendorMenuSection.js';
import Category from '../../model/category.model.js';
import Vendor           from "../../model/vendor/vendor.model.js";
import City from "../../model/location/City.js";
import mongoose from 'mongoose';

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

    const [portions, rawGroups, platformCategory] = await Promise.all([
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
        portions: (portions || []).map(p => ({
            ...p,
            price_naira: (p.price || 0) / 100,
        })),
        choice_groups: fullChoiceGroups,
    };
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

        // Step 1 — Fetch the vendor (Support both ID and Slug)
        const vendor = await Vendor.findOne({
            $or: [
                { _id: mongoose.Types.ObjectId.isValid(vendorId) ? vendorId : null },
                { storeSlug: vendorId }
            ].filter(Boolean)
        }).lean();

        if (!vendor) {
            return res.status(404).json({ success: false, message: "Vendor not found" });
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
            openingHours:          vendor.openingHours,
            acceptsDelivery:       vendor.acceptsDelivery ?? true,
            deliveryManagedBy:     vendor.deliveryManagedBy || "admin",
            deliveryFee:           resolvedDeliveryFee,  // ← resolved, not raw field
            estimatedDeliveryTime: vendor.estimatedDeliveryTime ?? 30,
            rating:                vendor.rating ?? null,
            storeSlug:             vendor.storeSlug,
        };

        // Step 2 — Fetch Combos, Sections, and Items in parallel
        const [rawCombos, sections, items] = await Promise.all([
            ComboItem.find({
                vendor_id:   vendor._id,
                is_available: { $ne: false },
                is_archived:  { $ne: true },
            }).sort({ sort_order: 1, createdAt: -1 }).lean(),

            VendorMenuSection.find({ 
                vendor_id: vendor._id,
                deleted_at: null,
                is_visible: { $ne: false }
            }).sort('sort_order').lean(),

            MenuItem.find({
                vendor_id: vendor._id,
                is_archived: { $ne: true },
                // Loosen filters: customers should see item even if out of stock (rendered as 'Sold Out')
                // is_available is the only "hard hide" flag
                is_available: { $ne: false },
                category_deactivated: { $ne: true },
            }).sort({ sort_order: 1, createdAt: -1 }).lean(),
        ]);

        // Step 3 — Fetch all portions and categories specifically for these items/combos
        const itemIds = items.map(i => i._id);
        const itemCategoryIds = items.map(i => i.platform_category_id?.toString()).filter(Boolean);
        const comboCategoryIds = rawCombos.map(c => c.platform_category_id?.toString()).filter(Boolean);
        const categoryIds = [...new Set([...itemCategoryIds, ...comboCategoryIds])];

        const [allPortions, categories] = await Promise.all([
            MenuItemPortion.find({
                menu_item_id: { $in: itemIds },
                is_available: { $ne: false },
            }).lean(),

            Category.find({ _id: { $in: categoryIds } })
                .populate('parent', 'name')
                .lean(),
        ]);

        // Step 4 — Index portions by item_id for faster lookup
        const portionsByItem = {};
        for (const p of allPortions) {
            const sid = p.menu_item_id?.toString();
            if (sid) {
                if (!portionsByItem[sid]) portionsByItem[sid] = [];
                portionsByItem[sid].push(p);
            }
        }

        const categoryMap = {};
        for (const c of categories) {
            categoryMap[c._id.toString()] = {
                _id: c._id,
                name: c.name,
                parent: c.parent ? { _id: c.parent._id, name: c.parent.name } : null
            };
        }

        // Step 5 — Enriched mapping for Combos
        const combos = (rawCombos || []).map(combo => ({
            _id:          combo._id,
            name:         combo.name,
            description:  combo.description || null,
            image_url:    combo.image_url   || null,
            price_naira:  Math.round((combo.price || 0) / 100),
            contents:     combo.contents    || [],
            dietary_type: combo.dietary_type || "mixed",
            tags:         combo.tags        || [],
            is_available: combo.is_available,
            platform_category: combo.platform_category_id ? categoryMap[combo.platform_category_id.toString()] : null,
            choice_groups: (combo.choice_groups || []).map(group => ({
                _id:            group._id,
                name:           group.name,
                is_required:    group.is_required,
                min_selections: group.min_selections,
                max_selections: group.max_selections,
                sort_order:     group.sort_order || 0,
                options: (group.options || []).map(opt => ({
                    _id:                  opt._id,
                    label:                opt.label,
                    image_url:            opt.image_url || null,
                    price_modifier_naira: Math.round((opt.price_modifier || 0) / 100),
                    is_available:         opt.is_available !== false,
                })),
            })),
        }));

        // Step 6 — Enriched mapping for Items
        const enrichedItems = items.map(item => {
            const portions = portionsByItem[item._id?.toString()] || [];
            const prices   = portions.map(p => p.price || 0);
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
                        ? Math.round((defPortion.price || 0) / 100)
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
            .filter(s => s.items.length > 0);

        // Virtual "General" Section for items without a section
        if (unsectioned.length > 0) {
            populatedSections.push({
                _id: "unsectioned",
                name: "General",
                description: "Other items from our menu",
                items: unsectioned,
                is_virtual: true
            });
        }

        // Virtual "Combos" Section for combos
        if (combos.length > 0) {
            // We insert it at the beginning as combos are usually promos
            populatedSections.unshift({
                _id: "combos",
                name: "Combos & Deals",
                description: "Specially curated meal combinations",
                items: combos.map(c => ({ ...c, item_type: "combo" })),
                is_virtual: true
            });
        }

        // Step 6 — Return the response
        return res.status(200).json({
            success:    true,
            vendor:     vendorData,
            combos,     // return separately too for legacy frontend support
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

        // Fetch vendor for customer view
        let vendorJson = null;
        if (!isVendorRequest) {
            const vendor = await Vendor.findById(item.vendor_id)
                .select("storeName logo address openingHours rating storeSlug isOpen estimatedDeliveryTime deliveryManagedBy flatRateDeliveryFee platformDeliveryFeeOverride")
                .lean();
            if (vendor) {
                const deliveryFee = await resolveStorefrontDeliveryFee(vendor);
                vendorJson = {
                    _id: vendor._id,
                    storeName: vendor.storeName,
                    logo: vendor.logo,
                    city: vendor.address?.city,
                    state: vendor.address?.state,
                    openingHours: vendor.openingHours,
                    rating: vendor.rating ?? null,
                    storeSlug: vendor.storeSlug,
                    isOpen: vendor.isOpen ?? true,
                    estimatedDeliveryTime: vendor.estimatedDeliveryTime ?? 30,
                    deliveryFee
                };
            }
        }

        res.status(200).json({ 
            success: true, 
            item: {
                ...full,
                vendor: vendorJson
            } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/vendors/:vendorId/menu/combos/:comboId
// ─────────────────────────────────────────────────────────────────────────────
export const getComboDetails = async (req, res) => {
    try {
        const { comboId } = req.params;
        const combo = await ComboItem.findOne({
            _id: comboId, is_archived: false
        }).lean();
        if (!combo) {
            return res.status(404).json({ success: false, message: 'Combo found' });
        }

        // Fetch vendor info
        const vendor = await Vendor.findById(combo.vendor_id)
            .select("storeName logo address openingHours rating storeSlug isOpen estimatedDeliveryTime deliveryManagedBy flatRateDeliveryFee platformDeliveryFeeOverride")
            .lean();
        
        let vendorJson = null;
        let deliveryFee = 0;
        if (vendor) {
            deliveryFee = await resolveStorefrontDeliveryFee(vendor);
            vendorJson = {
                _id: vendor._id,
                storeName: vendor.storeName,
                logo: vendor.logo,
                city: vendor.address?.city,
                state: vendor.address?.state,
                openingHours: vendor.openingHours,
                rating: vendor.rating ?? null,
                storeSlug: vendor.storeSlug,
                isOpen: vendor.isOpen ?? true,
                estimatedDeliveryTime: vendor.estimatedDeliveryTime ?? 30,
                deliveryFee
            };
        }

        res.status(200).json({
            success: true,
            combo: {
                _id:          combo._id,
                name:         combo.name,
                description:  combo.description || null,
                image_url:    combo.image_url   || null,
                price_naira:  Math.round(combo.price / 100),
                contents:     combo.contents    || [],
                dietary_type: combo.dietary_type || "mixed",
                tags:         combo.tags        || [],
                is_available: combo.is_available,
                deliveryFee:  deliveryFee,
                vendor:       vendorJson,
                choice_groups: combo.choice_groups.map(group => ({
                    _id:            group._id,
                    name:           group.name,
                    is_required:    group.is_required,
                    min_selections: group.min_selections,
                    max_selections: group.max_selections,
                    options: group.options.map(opt => ({
                        _id:                  opt._id,
                        label:                opt.label,
                        image_url:            opt.image_url || null,
                        price_modifier_naira: Math.round((opt.price_modifier || 0) / 100),
                        is_available:         opt.is_available !== false,
                    })),
                })),
            }
        });
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/vendors/foods/:foodId — Public food detail (no vendorId needed)
// ─────────────────────────────────────────────────────────────────────────────
export const getPublicFoodDetail = async (req, res) => {
    try {
        const { foodId } = req.params;

        if (!foodId) {
            return res.status(400).json({
                success: false,
                message: "foodId is required",
            });
        }

        // Find the item — must be active and not archived
        const item = await MenuItem.findOne({
            _id:          foodId,
            is_archived:  false,
            is_available: true,
        }).lean();

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Food item not found or unavailable",
            });
        }

        // Fetch vendor to attach delivery fee and store info
        const vendor = await Vendor.findById(item.vendor_id)
            .select(
                "storeName logo address openingHours rating " +
                "storeSlug deliveryManagedBy flatRateDeliveryFee " +
                "platformDeliveryFeeOverride isOpen estimatedDeliveryTime"
            )
            .lean();

        // Resolve delivery fee using same logic as storefront
        const deliveryFee = vendor
            ? await resolveStorefrontDeliveryFee(vendor)
            : 0;

        // Build full item — customer view (vendorView: false)
        // Populates: portions, choice_groups, combos, platform_category with parent
        const fullItem = await buildFullItem(item, { vendorView: false });

        return res.status(200).json({
            success: true,
            food: {
                ...fullItem,
                deliveryFee,
                vendor: vendor
                    ? {
                          _id:                   vendor._id,
                          storeName:             vendor.storeName,
                          logo:                  vendor.logo,
                          city:                  vendor.address?.city,
                          state:                 vendor.address?.state,
                          openingHours:          vendor.openingHours,
                          rating:                vendor.rating ?? null,
                          storeSlug:             vendor.storeSlug,
                          isOpen:                vendor.isOpen ?? true,
                          estimatedDeliveryTime: vendor.estimatedDeliveryTime ?? 30,
                      }
                    : null,
            },
        });

    } catch (error) {
        console.error("getPublicFoodDetail error:", error);
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};
