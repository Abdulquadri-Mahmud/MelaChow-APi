import mongoose from "mongoose";
import ChoiceGroupTemplate from "../../model/menu/ChoiceGroupTemplate.js";
import ComboItem from "../../model/menu/ComboItem.js";
import { MenuItemChoiceGroup } from "../../model/menu/MenuItemChoice.js";
import {
    normalizeChoiceGroupTemplateInput,
    serializeChoiceGroupTemplate,
} from "../../services/choiceGroupTemplate.service.js";

const escapeRegex = (value) => String(value).replace(/[.*+?^$()|[]\{}]/g, "\$&");

const getOwnedTemplate = async (templateId, vendorId) => {
    if (!mongoose.Types.ObjectId.isValid(templateId)) return null;
    return ChoiceGroupTemplate.findOne({ _id: templateId, vendor_id: vendorId });
};

const buildUsageMap = async (templates) => {
    const ids = templates.map((template) => template._id);
    if (ids.length === 0) return new Map();

    const [foodUsage, comboUsage] = await Promise.all([
        MenuItemChoiceGroup.aggregate([
            { $match: { source_template_id: { $in: ids } } },
            {
                $group: {
                    _id: "$source_template_id",
                    itemIds: { $addToSet: "$menu_item_id" },
                },
            },
            { $project: { count: { $size: "$itemIds" } } },
        ]),
        ComboItem.aggregate([
            { $unwind: "$choice_groups" },
            { $match: { "choice_groups.source_template_id": { $in: ids } } },
            {
                $group: {
                    _id: "$choice_groups.source_template_id",
                    comboIds: { $addToSet: "$_id" },
                },
            },
            { $project: { count: { $size: "$comboIds" } } },
        ]),
    ]);

    const usage = new Map();
    foodUsage.forEach((row) => {
        usage.set(String(row._id), { foods: row.count, combos: 0 });
    });
    comboUsage.forEach((row) => {
        const key = String(row._id);
        const current = usage.get(key) || { foods: 0, combos: 0 };
        usage.set(key, { ...current, combos: row.count });
    });
    return usage;
};

export const listChoiceGroupTemplates = async (req, res) => {
    try {
        const query = {
            vendor_id: req.vendor._id,
            is_archived: req.query.archived === "true",
        };
        if (req.query.search?.trim()) {
            query.name = { $regex: escapeRegex(req.query.search.trim()), $options: "i" };
        }

        const templates = await ChoiceGroupTemplate.find(query)
            .sort({ sort_order: 1, createdAt: -1 })
            .lean();
        const usage = await buildUsageMap(templates);

        return res.status(200).json({
            success: true,
            templates: templates.map((template) =>
                serializeChoiceGroupTemplate(template, usage.get(String(template._id)))
            ),
        });
    } catch {
        return res.status(500).json({ success: false, message: "Failed to load options library" });
    }
};

export const createChoiceGroupTemplate = async (req, res) => {
    try {
        const normalized = normalizeChoiceGroupTemplateInput(req.body);
        const template = await ChoiceGroupTemplate.create({
            vendor_id: req.vendor._id,
            ...normalized,
        });
        return res.status(201).json({
            success: true,
            template: serializeChoiceGroupTemplate(template),
        });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

export const updateChoiceGroupTemplate = async (req, res) => {
    try {
        const template = await getOwnedTemplate(req.params.templateId, req.vendor._id);
        if (!template) {
            return res.status(404).json({ success: false, message: "Template not found" });
        }

        const normalized = normalizeChoiceGroupTemplateInput(req.body);
        Object.assign(template, normalized);
        await template.save();

        return res.status(200).json({
            success: true,
            message: "Template updated. Existing menu items were not changed.",
            template: serializeChoiceGroupTemplate(template),
        });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

export const duplicateChoiceGroupTemplate = async (req, res) => {
    try {
        const source = await getOwnedTemplate(req.params.templateId, req.vendor._id);
        if (!source) {
            return res.status(404).json({ success: false, message: "Template not found" });
        }

        const duplicate = await ChoiceGroupTemplate.create({
            vendor_id: req.vendor._id,
            name: `${source.name} (Copy)`,
            is_required: source.is_required,
            min_selections: source.min_selections,
            max_selections: source.max_selections,
            sort_order: source.sort_order,
            options: source.options.map((option) => ({
                label: option.label,
                price_modifier: option.price_modifier,
                image_url: option.image_url,
                is_available: option.is_available,
                sort_order: option.sort_order,
            })),
            is_archived: false,
        });

        return res.status(201).json({
            success: true,
            template: serializeChoiceGroupTemplate(duplicate),
        });
    } catch {
        return res.status(500).json({ success: false, message: "Failed to duplicate template" });
    }
};

export const setChoiceGroupTemplateArchiveStatus = async (req, res) => {
    try {
        if (typeof req.body.is_archived !== "boolean") {
            return res.status(400).json({ success: false, message: "is_archived must be a boolean" });
        }

        const template = await getOwnedTemplate(req.params.templateId, req.vendor._id);
        if (!template) {
            return res.status(404).json({ success: false, message: "Template not found" });
        }

        template.is_archived = req.body.is_archived;
        await template.save();

        return res.status(200).json({
            success: true,
            message: req.body.is_archived
                ? "Template archived. Existing menu items were not changed."
                : "Template restored.",
            template: serializeChoiceGroupTemplate(template),
        });
    } catch {
        return res.status(500).json({ success: false, message: "Failed to update template" });
    }
};
