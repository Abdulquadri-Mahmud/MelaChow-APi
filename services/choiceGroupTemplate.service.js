const MAX_OPTIONS = 50;

const asInteger = (value, fallback) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : fallback;
};

const validateImageUrl = (value) => {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    try {
        new URL(trimmed);
        return trimmed;
    } catch {
        throw new Error("Option image_url must be a valid URL");
    }
};

export const normalizeChoiceGroupTemplateInput = (payload = {}) => {
    const name = String(payload.name || "").trim();
    if (!name) throw new Error("Template name is required");
    if (name.length > 80) throw new Error("Template name cannot exceed 80 characters");

    const minSelections = asInteger(payload.min_selections, 0);
    const maxSelections = asInteger(payload.max_selections, 1);
    const isRequired = payload.is_required === true || minSelections > 0;

    if (minSelections < 0) throw new Error("Minimum selections cannot be negative");
    if (maxSelections < 1) throw new Error("Maximum selections must be at least 1");
    if (maxSelections < minSelections) {
        throw new Error("Maximum selections must be greater than or equal to minimum selections");
    }
    if (isRequired && minSelections < 1) {
        throw new Error("Required templates must have at least one minimum selection");
    }

    if (!Array.isArray(payload.options) || payload.options.length === 0) {
        throw new Error("Add at least one option to the template");
    }
    if (payload.options.length > MAX_OPTIONS) {
        throw new Error(`A template cannot contain more than ${MAX_OPTIONS} options`);
    }

    const seenLabels = new Set();
    const options = payload.options.map((option, index) => {
        const label = String(option?.label || "").trim();
        if (!label) throw new Error(`Option ${index + 1} needs a name`);
        if (label.length > 80) throw new Error(`Option "${label}" cannot exceed 80 characters`);

        const normalizedLabel = label.toLowerCase();
        if (seenLabels.has(normalizedLabel)) {
            throw new Error(`Option "${label}" is duplicated`);
        }
        seenLabels.add(normalizedLabel);

        const priceNaira = Number(option.price_modifier_naira ?? 0);
        if (!Number.isFinite(priceNaira) || priceNaira < 0) {
            throw new Error(`Option "${label}" must have a valid non-negative price`);
        }
        const trackStock = option.track_stock === true;
        const stockQuantity = asInteger(option.stock_quantity, 0);
        const lowStockThreshold = asInteger(option.low_stock_threshold, 5);
        if (stockQuantity < 0) throw new Error(`Option "${label}" stock cannot be negative`);
        if (lowStockThreshold < 0) throw new Error(`Option "${label}" low-stock threshold cannot be negative`);

        return {
            label,
            price_modifier: Math.round(priceNaira * 100),
            image_url: validateImageUrl(option.image_url),
            is_available: option.is_available !== false,
            track_stock: trackStock,
            stock_quantity: trackStock ? stockQuantity : 0,
            low_stock_threshold: lowStockThreshold,
            sort_order: asInteger(option.sort_order, index),
        };
    });

    return {
        name,
        is_required: isRequired,
        min_selections: minSelections,
        max_selections: maxSelections,
        sort_order: asInteger(payload.sort_order, 0),
        options,
    };
};

export const serializeChoiceGroupTemplate = (template, usage = {}) => {
    const value = typeof template?.toObject === "function" ? template.toObject() : template;
    return {
        ...value,
        options: (value?.options || []).map((option) => ({
            ...option,
            price_modifier_naira: (option.price_modifier || 0) / 100,
        })),
        usage: {
            foods: usage.foods || 0,
            combos: usage.combos || 0,
            total: (usage.foods || 0) + (usage.combos || 0),
        },
    };
};
