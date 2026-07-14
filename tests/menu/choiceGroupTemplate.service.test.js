import {
    normalizeChoiceGroupTemplateInput,
    serializeChoiceGroupTemplate,
} from "../../services/choiceGroupTemplate.service.js";

describe("choice-group template normalization", () => {
    it("normalizes a valid template and converts naira prices to kobo", () => {
        const result = normalizeChoiceGroupTemplateInput({
            name: "  Add Protein  ",
            is_required: false,
            min_selections: 0,
            max_selections: 2,
            options: [
                { label: " Chicken ", price_modifier_naira: 800 },
                { label: "Fish", price_modifier_naira: 1000, is_available: false },
            ],
        });

        expect(result.name).toBe("Add Protein");
        expect(result.options[0]).toEqual(expect.objectContaining({
            label: "Chicken",
            price_modifier: 80000,
            is_available: true,
        }));
        expect(result.options[1].price_modifier).toBe(100000);
        expect(result.options[1].is_available).toBe(false);
    });

    it("rejects duplicate option labels without case sensitivity", () => {
        expect(() => normalizeChoiceGroupTemplateInput({
            name: "Choose Protein",
            max_selections: 1,
            options: [
                { label: "Chicken" },
                { label: " chicken " },
            ],
        })).toThrow('Option "chicken" is duplicated');
    });

    it("rejects invalid required selection rules", () => {
        expect(() => normalizeChoiceGroupTemplateInput({
            name: "Choose Soup",
            is_required: true,
            min_selections: 0,
            max_selections: 1,
            options: [{ label: "Egusi" }],
        })).toThrow("Required templates must have at least one minimum selection");
    });

    it("serializes kobo prices and usage for vendor clients", () => {
        const result = serializeChoiceGroupTemplate({
            _id: "template-1",
            name: "Add Drink",
            options: [{ label: "Malt", price_modifier: 50000 }],
        }, { foods: 2, combos: 3 });

        expect(result.options[0].price_modifier_naira).toBe(500);
        expect(result.usage).toEqual({ foods: 2, combos: 3, total: 5 });
    });

    it("normalizes optional stock defaults independently from selection limits", () => {
        const result = normalizeChoiceGroupTemplateInput({
            name: "Choose Protein",
            max_selections: 2,
            options: [{
                label: "Beef",
                track_stock: true,
                stock_quantity: 200,
                low_stock_threshold: 10,
            }],
        });
        expect(result.max_selections).toBe(2);
        expect(result.options[0]).toEqual(expect.objectContaining({
            track_stock: true,
            stock_quantity: 200,
            low_stock_threshold: 10,
        }));
    });

    it("rejects negative option stock", () => {
        expect(() => normalizeChoiceGroupTemplateInput({
            name: "Choose Protein",
            options: [{ label: "Turkey", track_stock: true, stock_quantity: -1 }],
        })).toThrow("stock cannot be negative");
    });
});
