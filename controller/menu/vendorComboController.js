import mongoose from "mongoose";
import ComboItem from "../../model/menu/ComboItem.js";
import ChoiceGroupTemplate from "../../model/menu/ChoiceGroupTemplate.js";
import { usePostgresMenuReads } from "../../services/postgres/compat.js";

const getPostgresMenuRepository = async () => {
    const { menuCatalogRepository } = await import("../../services/postgres/menuCatalog.repository.js");
    return menuCatalogRepository;
};

const validateChoiceGroupTemplateSources = async (choiceGroups, vendorId, { requireActive = true } = {}) => {
    const sourceIds = [...new Set(
        (choiceGroups || [])
            .map((group) => group.source_template_id)
            .filter(Boolean)
            .map(String)
    )];
    if (sourceIds.length === 0) return true;
    if (sourceIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) return false;

    const query = {
        _id: { $in: sourceIds },
        vendor_id: vendorId,
    };
    if (requireActive) query.is_archived = false;
    const ownedCount = await ChoiceGroupTemplate.countDocuments(query);
    return ownedCount === sourceIds.length;
};

const normalizeComboOption = (opt) => {
    const stockQuantity = Number(opt.stock_quantity ?? 0);
    const lowStockThreshold = Number(opt.low_stock_threshold ?? 5);
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0 || !Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
        throw new Error(`Option "${opt.label || "Unnamed"}" stock values must be non-negative whole numbers`);
    }
    return {
        ...opt,
        price_modifier: Math.round(Number(opt.price_modifier_naira || 0) * 100),
        track_stock: opt.track_stock === true,
        stock_quantity: opt.track_stock === true ? stockQuantity : 0,
        low_stock_threshold: lowStockThreshold,
    };
};

/**
 * Create a new combo item
 * Input: price_naira, price_modifier_naira (client sends naira)
 * Storage: price, price_modifier (stored in kobo)
 * Validation: name, price required; choice groups properly configured
 */
export const createComboItem = async (req, res) => {
    try {
        const {
            name,
            description,
            image_url,
            price_naira,
            dietary_type,
            prep_time_minutes,
            tags,
            contents,
            platform_category_id,
            vendor_section_id,
            choice_groups,
        } = req.body;

        const vendor_id = req.vendor._id;

        // Validation: Required fields
        if (!name || name.trim() === "") {
            return res.status(400).json({ success: false, message: "Food name is required" });
        }

        if (price_naira === undefined || price_naira === null) {
            return res.status(400).json({ success: false, message: "Price is required" });
        }

        if (typeof price_naira !== "number" || price_naira <= 0) {
            return res.status(400).json({ success: false, message: "Price must be a positive number" });
        }

        if (!platform_category_id) {
            return res.status(400).json({ success: false, message: "Platform category is required" });
        }

        // Validate choice groups
        if (choice_groups && Array.isArray(choice_groups)) {
            if (!(await validateChoiceGroupTemplateSources(choice_groups, vendor_id))) {
                return res.status(400).json({
                    success: false,
                    message: "One or more source templates are unavailable",
                });
            }
            for (const group of choice_groups) {
                if (group.is_required && group.min_selections < 1) {
                    return res.status(400).json({
                        success: false,
                        message: `Required group "${group.name}" must have min_selections >= 1`,
                    });
                }

                if (group.max_selections < group.min_selections) {
                    return res.status(400).json({
                        success: false,
                        message: `Group "${group.name}": max_selections must be >= min_selections`,
                    });
                }

                if (!group.options || group.options.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Group "${group.name}" must have at least one option`,
                    });
                }

                // Convert option price modifiers from naira to kobo
                group.options = group.options.map(normalizeComboOption);
            }
        }

        // Create combo item with price converted to kobo
        const comboItem = await ComboItem.create({
            vendor_id,
            name,
            description,
            image_url,
            price: price_naira * 100, // Convert naira to kobo
            dietary_type: dietary_type || "mixed",
            prep_time_minutes,
            tags: tags || [],
            contents: contents || [],
            platform_category_id,
            vendor_section_id: vendor_section_id || null,
            choice_groups: choice_groups || [],
            is_available: true,
            is_in_stock: true,
            is_archived: false,
        });

        // Return with price converted back to naira for response
        const response = {
            ...comboItem.toObject(),
            price_naira: comboItem.price / 100,
        };

        res.status(201).json({ success: true, comboItem: response });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
            ...(process.env.NODE_ENV === "development" && { detail: error.message }),
        });
    }
};

/**
 * Get all combos for a vendor
 * Query params: is_available (boolean), search (text search)
 */
export const getVendorCombos = async (req, res) => {
    try {
        const { vendorId } = req.params;
        const { is_available, is_archived, search, page = 1, limit = 10 } = req.query;

        if (usePostgresMenuReads()) {
            const menuCatalogRepository = await getPostgresMenuRepository();
            const { combos, pagination } = await menuCatalogRepository.listVendorCombos(vendorId, {
                is_available,
                is_archived,
                search,
                page,
                limit,
            });

            return res.status(200).json({
                success: true,
                combos,
                pagination,
            });
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        // Build query
        const query = {
            vendor_id: new mongoose.Types.ObjectId(vendorId),
            is_archived: is_archived === "true",
        };

        // Filter by availability
        if (is_available !== undefined) {
            query.is_available = is_available === "true";
        }

        // Text search & Count
        let combos;
        let total;

        if (search && search.trim()) {
            const searchQuery = { ...query, $text: { $search: search } };
            total = await ComboItem.countDocuments(searchQuery);
            combos = await ComboItem.find(
                searchQuery,
                { score: { $meta: "textScore" } }
            )
                .sort({ score: { $meta: "textScore" }, sort_order: 1, createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean();
        } else {
            total = await ComboItem.countDocuments(query);
            combos = await ComboItem.find(query)
                .sort({ sort_order: 1, createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean();
        }

        // Convert prices to naira
        const result = (combos || []).map((combo) => ({
            ...combo,
            price_naira: (combo.price || 0) / 100,
            choice_groups: (combo.choice_groups || []).map((group) => ({
                ...group,
                options: (group.options || []).map((opt) => ({
                    ...opt,
                    price_modifier_naira: Math.round((opt.price_modifier || 0) / 100),
                })),
            })),
        }));

        res.status(200).json({
            success: true,
            combos: result,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum),
                hasMore: skip + result.length < total
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
            ...(process.env.NODE_ENV === "development" && { detail: error.message }),
        });
    }
};

/**
 * Get a single combo by ID
 */
export const getComboById = async (req, res) => {
    try {
        const { comboId } = req.params;

        if (usePostgresMenuReads()) {
            const menuCatalogRepository = await getPostgresMenuRepository();
            const combo = await menuCatalogRepository.getComboById(comboId);

            if (!combo) {
                return res.status(404).json({ success: false, message: "Combo item not found" });
            }

            return res.status(200).json({ success: true, combo });
        }

        const combo = await ComboItem.findOne({
            _id: new mongoose.Types.ObjectId(comboId),
        }).lean();

        if (!combo) {
            return res.status(404).json({ success: false, message: "Combo item not found" });
        }

        // Convert prices to naira
        const result = {
            ...combo,
            price_naira: (combo.price || 0) / 100,
            choice_groups: (combo.choice_groups || []).map((group) => ({
                ...group,
                options: (group.options || []).map((opt) => ({
                    ...opt,
                    price_modifier_naira: Math.round((opt.price_modifier || 0) / 100),
                })),
            })),
        };

        res.status(200).json({ success: true, combo: result });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
            ...(process.env.NODE_ENV === "development" && { detail: error.message }),
        });
    }
};

/**
 * Update a combo item
 * Input: any subset of fields (price_naira if updating price)
 * Full choice_groups replacement if provided
 */
export const updateComboItem = async (req, res) => {
    try {
        const { comboId } = req.params;
        const updateData = { ...req.body };

        // Convert price_naira to kobo if provided
        if (updateData.price_naira !== undefined) {
            updateData.price = updateData.price_naira * 100;
            delete updateData.price_naira;
        }

        // Convert choice group option modifiers if provided
        if (updateData.choice_groups && Array.isArray(updateData.choice_groups)) {
            if (!(await validateChoiceGroupTemplateSources(
                updateData.choice_groups,
                req.vendor._id,
                { requireActive: false }
            ))) {
                return res.status(400).json({
                    success: false,
                    message: "One or more source templates are unavailable",
                });
            }
            // Validate choice groups
            for (const group of updateData.choice_groups) {
                if (group.is_required && group.min_selections < 1) {
                    return res.status(400).json({
                        success: false,
                        message: `Required group "${group.name}" must have min_selections >= 1`,
                    });
                }

                if (group.max_selections < group.min_selections) {
                    return res.status(400).json({
                        success: false,
                        message: `Group "${group.name}": max_selections must be >= min_selections`,
                    });
                }

                if (!group.options || group.options.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Group "${group.name}" must have at least one option`,
                    });
                }

                // Convert option modifiers from naira to kobo
                group.options = group.options.map(normalizeComboOption);
            }
        }

        const combo = await ComboItem.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(comboId), vendor_id: req.vendor._id },
            { $set: updateData },
            { new: true, runValidators: true }
        ).lean();

        if (!combo) {
            return res.status(404).json({ success: false, message: "Combo item not found or does not belong to vendor" });
        }

        // Convert prices to naira for response
        const result = {
            ...combo,
            price_naira: combo.price / 100,
            choice_groups: combo.choice_groups.map((group) => ({
                ...group,
                options: group.options.map((opt) => ({
                    ...opt,
                    price_modifier_naira: Math.round((opt.price_modifier || 0) / 100),
                })),
            })),
        };

        res.status(200).json({ success: true, combo: result });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
            ...(process.env.NODE_ENV === "development" && { detail: error.message }),
        });
    }
};

/**
 * Toggle combo availability
 */
export const toggleComboAvailability = async (req, res) => {
    try {
        const { comboId } = req.params;
        const { is_available } = req.body;

        if (is_available === undefined) {
            return res.status(400).json({ success: false, message: "is_available field is required" });
        }

        const combo = await ComboItem.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(comboId), vendor_id: req.vendor._id },
            { is_available },
            { new: true }
        ).lean();

        if (!combo) {
            return res.status(404).json({ success: false, message: "Combo item not found or does not belong to vendor" });
        }

        // Convert prices to naira for response
        const result = {
            ...combo,
            price_naira: combo.price / 100,
            choice_groups: combo.choice_groups.map((group) => ({
                ...group,
                options: group.options.map((opt) => ({
                    ...opt,
                    price_modifier_naira: Math.round((opt.price_modifier || 0) / 100),
                })),
            })),
        };

        res.status(200).json({ success: true, combo: result });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
            ...(process.env.NODE_ENV === "development" && { detail: error.message }),
        });
    }
};

/**
 * Archive a combo item (soft delete)
 */
export const archiveComboItem = async (req, res) => {
    try {
        const { comboId } = req.params;
        const { is_archived } = req.body;

        if (is_archived === undefined) {
             return res.status(400).json({ success: false, message: "is_archived field is required" });
        }

        const combo = await ComboItem.findOneAndUpdate(
            { _id: new mongoose.Types.ObjectId(comboId), vendor_id: req.vendor._id },
            { is_archived, is_available: is_archived ? false : true },
            { new: true }
        ).lean();

        if (!combo) {
            return res.status(404).json({ success: false, message: "Combo item not found or does not belong to vendor" });
        }

        const message = is_archived ? "Combo item archived successfully" : "Combo item restored successfully";
        res.status(200).json({ success: true, message, combo });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
            ...(process.env.NODE_ENV === "development" && { detail: error.message }),
        });
    }
};
