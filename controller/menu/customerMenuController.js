import ComboItem from '../../model/menu/ComboItem.js';
import MenuItem from '../../model/menu/MenuItem.js';
import MenuItemPortion from '../../model/menu/MenuItemPortion.js';
import { MenuItemChoiceGroup, MenuItemChoiceOption } from '../../model/menu/MenuItemChoice.js';
import VendorMenuSection from '../../model/menu/VendorMenuSection.js';
import Category from '../../model/category.model.js';
import Vendor           from "../../model/vendor/vendor.model.js";
import City from "../../model/location/City.js";
import VendorDeliveryPromo from "../../model/promo/VendorDeliveryPromo.js";
import VendorDeliveryClaim from "../../model/promo/VendorDeliveryClaim.js";
import { buildPromoIdentity } from "../../utils/promoIdentity.js";
import mongoose from 'mongoose';
import { usePostgresMenuReads } from "../../services/postgres/compat.js";

const getPostgresMenuRepository = async () => {
    const { menuCatalogRepository } = await import("../../services/postgres/menuCatalog.repository.js");
    return menuCatalogRepository;
};

const getRequestPromoIdentity = (req) => buildPromoIdentity({
    deviceId: req.headers["x-melachow-device-id"] || req.query?.deviceId,
    phone: req.query?.phone,
});

const toPublicMenuVendor = (vendor, { includeDeliveryFee = false } = {}) => {
    if (!vendor) return null;

    const publicVendor = {
        _id: vendor._id,
        storeName: vendor.storeName,
        logo: vendor.logo,
        city: vendor.address?.city,
        state: vendor.address?.state,
        openingHours: vendor.openingHours,
        rating: vendor.rating ?? null,
        ratingCount: vendor.ratingCount ?? 0,
        storeSlug: vendor.storeSlug,
        isOpen: vendor.isOpen ?? true,
        estimatedDeliveryTime: vendor.estimatedDeliveryTime ?? 30,
        hasActiveDeliveryPromo: vendor.hasActiveDeliveryPromo || false,
        activeDeliveryPromo: vendor.activeDeliveryPromo || null,
    };

    if (includeDeliveryFee) {
        publicVendor.deliveryFee = vendor.deliveryFee || 0;
    }

    return publicVendor;
};

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
                is_available: opt.is_available !== false && (!opt.track_stock || opt.stock_quantity > 0),
                track_stock: opt.track_stock === true,
                stock_quantity: opt.track_stock ? Math.max(0, opt.stock_quantity || 0) : null,
                low_stock_threshold: opt.low_stock_threshold ?? 5,
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
/**
 * Resolve the delivery fee a customer will be charged for this vendor.
 * All deliveries are platform-managed. Resolution order:
 * 1. platformDeliveryFeeOverride (per-vendor admin override)
 * 2. City.platformDeliveryFee (city-level default)
 * Returns fee in NAIRA.
 */
async function getActiveVendorDeliveryPromo(vendorId, promoIdentity = {}) {
    const now = new Date();
    const promo = await VendorDeliveryPromo.findOne({
        vendorId,
        isActive: true,
        startsAt: { $lte: now },
        endsAt: { $gte: now },
        $or: [
            { maxOrders: null },
            { $expr: { $lt: ["$usedOrders", "$maxOrders"] } },
        ],
    }).select("_id maxOrders usedOrders startsAt endsAt").lean();

    const claimChecks = [];
    if (promo?._id && promoIdentity.hashedDeviceId) {
        claimChecks.push({ promoId: promo._id, hashedDeviceId: promoIdentity.hashedDeviceId });
    }
    if (promo?._id && promoIdentity.phoneHash) {
        claimChecks.push({ promoId: promo._id, phoneHash: promoIdentity.phoneHash });
    }
    const usedPromo = claimChecks.length
        ? await VendorDeliveryClaim.findOne({ $or: claimChecks }).select("_id").lean()
        : null;

    return usedPromo ? null : promo;
}

async function resolveStorefrontDeliveryFee(vendor) {
    const activePromo = await getActiveVendorDeliveryPromo(vendor._id, vendor.promoIdentity);
    if (activePromo) return 0;

    if (
        vendor.platformDeliveryFeeOverride != null &&
        vendor.platformDeliveryFeeOverride > 0
    ) {
        return vendor.platformDeliveryFeeOverride;
    }
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

async function buildVendorDeliveryPromoContext(vendor) {
    const activePromo = await getActiveVendorDeliveryPromo(vendor._id, vendor.promoIdentity);
    return {
        hasActiveDeliveryPromo: !!activePromo,
        activeDeliveryPromo: activePromo
            ? {
                promoId: activePromo._id,
                maxOrders: activePromo.maxOrders,
                usedOrders: activePromo.usedOrders,
                remainingOrders: activePromo.maxOrders == null
                    ? null
                    : Math.max(0, activePromo.maxOrders - activePromo.usedOrders),
                startsAt: activePromo.startsAt,
                endsAt: activePromo.endsAt,
            }
            : null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/vendors/:vendorId/menu — Full vendor menu grouped by vendor sections
// ─────────────────────────────────────────────────────────────────────────────
export const getFullVendorMenu = async (req, res) => {
    try {
        const { vendorId } = req.params;

        if (usePostgresMenuReads()) {
            const menuCatalogRepository = await getPostgresMenuRepository();
            const menu = await menuCatalogRepository.getFullVendorMenu(vendorId);
            if (!menu) {
                return res.status(404).json({ success: false, message: "Vendor not found" });
            }

            return res.status(200).json({
                success: true,
                vendor: menu.vendor,
                combos: menu.combos,
                sections: menu.sections,
                unsectioned: menu.unsectioned,
            });
        }

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
        vendor.promoIdentity = getRequestPromoIdentity(req);

        // Resolve the fee the customer will actually be charged
        const resolvedDeliveryFee = await resolveStorefrontDeliveryFee(vendor);
        const vendorPromoContext = await buildVendorDeliveryPromoContext(vendor);

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
            deliveryFee:           resolvedDeliveryFee,  // ← resolved, not raw field
            estimatedDeliveryTime: vendor.estimatedDeliveryTime ?? 30,
            rating:                vendor.rating ?? null,
            ratingCount:           vendor.ratingCount ?? 0,
            storeSlug:             vendor.storeSlug,
            ...vendorPromoContext,
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
                    is_available:         opt.is_available !== false && (!opt.track_stock || opt.stock_quantity > 0),
                    track_stock:          opt.track_stock === true,
                    stock_quantity:       opt.track_stock ? Math.max(0, opt.stock_quantity || 0) : null,
                    low_stock_threshold:   opt.low_stock_threshold ?? 5,
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
        const isVendorRequest = !!req.params.vendorId;

        if (usePostgresMenuReads()) {
            const menuCatalogRepository = await getPostgresMenuRepository();
            const full = await menuCatalogRepository.getMenuItemDetails(itemId, { vendorView: isVendorRequest });
            if (!full) return res.status(404).json({ success: false, message: 'Item not found' });

            return res.status(200).json({
                success: true,
                item: {
                    ...full,
                    vendor: isVendorRequest
                        ? null
                        : toPublicMenuVendor(full.vendor, { includeDeliveryFee: true }),
                },
            });
        }
        const item = await MenuItem.findOne({ _id: itemId, is_archived: false }).lean();
        if (!item) return res.status(404).json({ success: false, message: 'Item not found' });

        // Determine if this is a vendor request
        // vendorId in the URL means vendor is viewing their own item
        const full = await buildFullItem(item, { vendorView: isVendorRequest });

        // Fetch vendor for customer view
        let vendorJson = null;
        if (!isVendorRequest) {
            const vendor = await Vendor.findById(item.vendor_id)
                .select("storeName logo address openingHours rating ratingCount storeSlug isOpen estimatedDeliveryTime platformDeliveryFeeOverride hasActiveDeliveryPromo")
                .lean();
            if (vendor) {
                vendor.promoIdentity = getRequestPromoIdentity(req);
                const deliveryFee = await resolveStorefrontDeliveryFee(vendor);
                const vendorPromoContext = await buildVendorDeliveryPromoContext(vendor);
                vendorJson = {
                    _id: vendor._id,
                    storeName: vendor.storeName,
                    logo: vendor.logo,
                    city: vendor.address?.city,
                    state: vendor.address?.state,
                    openingHours: vendor.openingHours,
                    rating: vendor.rating ?? null,
                    ratingCount: vendor.ratingCount ?? 0,
                    storeSlug: vendor.storeSlug,
                    isOpen: vendor.isOpen ?? true,
                    estimatedDeliveryTime: vendor.estimatedDeliveryTime ?? 30,
                    deliveryFee,
                    ...vendorPromoContext,
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

        if (usePostgresMenuReads()) {
            const menuCatalogRepository = await getPostgresMenuRepository();
            const combo = await menuCatalogRepository.getComboDetails(comboId);
            if (!combo) {
                return res.status(404).json({ success: false, message: 'Combo not found' });
            }

            return res.status(200).json({
                success: true,
                combo: {
                    ...combo,
                    deliveryFee: combo.vendor?.deliveryFee || 0,
                    vendor: toPublicMenuVendor(combo.vendor, { includeDeliveryFee: true }),
                },
            });
        }
        const combo = await ComboItem.findOne({
            _id: comboId, is_archived: false
        }).lean();
        if (!combo) {
            return res.status(404).json({ success: false, message: 'Combo not found' });
        }

        // Fetch vendor info
        const vendor = await Vendor.findById(combo.vendor_id)
            .select("storeName logo address openingHours rating ratingCount storeSlug isOpen estimatedDeliveryTime platformDeliveryFeeOverride hasActiveDeliveryPromo")
            .lean();
        
        let vendorJson = null;
        let deliveryFee = 0;
        if (vendor) {
            vendor.promoIdentity = getRequestPromoIdentity(req);
            deliveryFee = await resolveStorefrontDeliveryFee(vendor);
            const vendorPromoContext = await buildVendorDeliveryPromoContext(vendor);
            vendorJson = {
                _id: vendor._id,
                storeName: vendor.storeName,
                logo: vendor.logo,
                city: vendor.address?.city,
                state: vendor.address?.state,
                openingHours: vendor.openingHours,
                rating: vendor.rating ?? null,
                ratingCount: vendor.ratingCount ?? 0,
                storeSlug: vendor.storeSlug,
                isOpen: vendor.isOpen ?? true,
                estimatedDeliveryTime: vendor.estimatedDeliveryTime ?? 30,
                deliveryFee,
                ...vendorPromoContext,
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
                        is_available:         opt.is_available !== false && (!opt.track_stock || opt.stock_quantity > 0),
                        track_stock:          opt.track_stock === true,
                        stock_quantity:       opt.track_stock ? Math.max(0, opt.stock_quantity || 0) : null,
                        low_stock_threshold:   opt.low_stock_threshold ?? 5,
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

        if (usePostgresMenuReads()) {
            const menuCatalogRepository = await getPostgresMenuRepository();
            const { items, total } = await menuCatalogRepository.listItemsByPlatformCategory(categoryId, { page, limit });

            return res.status(200).json({
                success: true,
                category_id: categoryId,
                items,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / Number(limit)),
                },
            });
        }

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

        if (usePostgresMenuReads()) {
            const menuCatalogRepository = await getPostgresMenuRepository();
            const vendorIds = await menuCatalogRepository.listVendorIdsByPlatformCategory(categoryId);

            return res.status(200).json({ success: true, category_id: categoryId, vendor_ids: vendorIds });
        }

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

        if (usePostgresMenuReads()) {
            const menuCatalogRepository = await getPostgresMenuRepository();
            const item = await menuCatalogRepository.getMenuItemDetails(foodId);
            if (item) {
                return res.status(200).json({
                    success: true,
                    food: {
                        ...item,
                        deliveryFee: item.vendor?.deliveryFee || 0,
                        vendor: toPublicMenuVendor(item.vendor),
                    },
                });
            }

            const combo = await menuCatalogRepository.getComboDetails(foodId);
            if (combo) {
                return res.status(200).json({
                    success: true,
                    food: {
                        ...combo,
                        type: 'combo',
                        deliveryFee: combo.vendor?.deliveryFee || 0,
                        vendor: toPublicMenuVendor(combo.vendor),
                    },
                });
            }

            return res.status(404).json({
                success: false,
                message: "Food item or combo not found or unavailable",
            });
        }

        // Find the item — must be active and not archived
        let item = await MenuItem.findOne({
            _id:          foodId,
            is_archived:  { $ne: true },
            is_available: { $ne: false },
        }).lean();

        // Fallback: Check if it's a combo
        let isCombo = false;
        if (!item) {
            item = await ComboItem.findOne({
                _id:          foodId,
                is_archived:  { $ne: true },
                is_available: { $ne: false },
            }).lean();
            if (item) isCombo = true;
        }

        if (!item) {
            return res.status(404).json({
                success: false,
                message: "Food item or combo not found or unavailable",
            });
        }

        // Fetch vendor to attach delivery fee and store info
        const vendor = await Vendor.findById(item.vendor_id || item.vendorId)
            .select(
                "storeName logo address openingHours rating ratingCount " +
                "storeSlug platformDeliveryFeeOverride isOpen estimatedDeliveryTime"
            )
            .lean();
        if (vendor) {
            vendor.promoIdentity = getRequestPromoIdentity(req);
        }

        // Resolve delivery fee using same logic as storefront
        const deliveryFee = vendor
            ? await resolveStorefrontDeliveryFee(vendor)
            : 0;
        const vendorPromoContext = vendor
            ? await buildVendorDeliveryPromoContext(vendor)
            : { hasActiveDeliveryPromo: false, activeDeliveryPromo: null };

        let resultData;

        if (isCombo) {
            // Format combo to look like a food item for the food-details page
            // to prevent crashes, or provide enough data.
            resultData = {
                ...item,
                type: 'combo',
                price_naira: Math.round(item.price / 100),
                choiceGroups: (item.choice_groups || []).map(group => ({
                    ...group,
                    options: (group.options || []).map(opt => ({
                        ...opt,
                        price_modifier_naira: Math.round((opt.price_modifier || 0) / 100)
                    }))
                }))
            };
        } else {
            // Build full item — customer view (vendorView: false)
            // Populates: portions, choice_groups, platform_category with parent
            const fullItem = await buildFullItem(item, { vendorView: false });
            resultData = fullItem;
        }

        return res.status(200).json({
            success: true,
            food: {
                ...resultData,
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
                          ratingCount:           vendor.ratingCount ?? 0,
                          storeSlug:             vendor.storeSlug,
                          isOpen:                vendor.isOpen ?? true,
                          estimatedDeliveryTime: vendor.estimatedDeliveryTime ?? 30,
                          ...vendorPromoContext,
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
