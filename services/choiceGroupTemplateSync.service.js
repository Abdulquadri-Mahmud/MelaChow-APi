import ComboItem from "../model/menu/ComboItem.js";
import { MenuItemChoiceGroup, MenuItemChoiceOption } from "../model/menu/MenuItemChoice.js";

const optionsFor = (template) => (template.options || []).map((option, index) => ({
    source_template_option_id: option._id,
    label: option.label,
    price_modifier: option.price_modifier || 0,
    image_url: option.image_url || null,
    is_available: option.is_available !== false,
    track_stock: option.track_stock === true,
    stock_quantity: option.track_stock ? Math.max(0, option.stock_quantity || 0) : 0,
    low_stock_threshold: option.low_stock_threshold ?? 5,
    sort_order: option.sort_order ?? index,
}));

const groupFields = (template) => ({
    name: template.name, is_required: template.is_required,
    min_selections: template.min_selections, max_selections: template.max_selections,
    sort_order: template.sort_order,
});

// Keep linked menu records as order-safe projections of their library source.
export const syncChoiceGroupTemplateUsages = async (template) => {
    const groups = await MenuItemChoiceGroup.find({ source_template_id: template._id }).select("_id").lean();
    const groupIds = groups.map((group) => group._id);
    if (groupIds.length) {
        await MenuItemChoiceGroup.updateMany({ _id: { $in: groupIds } }, { $set: groupFields(template) });
        await MenuItemChoiceOption.deleteMany({ group_id: { $in: groupIds } });
        const options = groupIds.flatMap((group_id) => optionsFor(template).map((option) => ({ ...option, group_id })));
        if (options.length) await MenuItemChoiceOption.insertMany(options);
    }

    const combos = await ComboItem.find({ "choice_groups.source_template_id": template._id });
    await Promise.all(combos.map(async (combo) => {
        combo.choice_groups.forEach((group) => {
            if (String(group.source_template_id) === String(template._id)) {
                Object.assign(group, groupFields(template), { options: optionsFor(template) });
            }
        });
        await combo.save();
    }));
};
