import mongoose from "mongoose";
import { jest } from "@jest/globals";
import { MenuItemChoiceOption } from "../../model/menu/MenuItemChoice.js";
import {
    reserveOptionStockForOrder,
    restoreOptionStockForOrder,
} from "../../services/optionStock.service.js";

describe("option stock reservation", () => {
    it("deducts selected units and restores them once", async () => {
        const groupId = new mongoose.Types.ObjectId();
        const option = await MenuItemChoiceOption.create({
            group_id: groupId,
            label: "Beef",
            track_stock: true,
            stock_quantity: 20,
        });
        const order = {
            items: [{
                type: "item",
                quantity: 3,
                selected_options: [{
                    group_id: groupId,
                    option_id: option._id,
                    label: "Beef",
                    quantity: 2,
                    stock_tracked: true,
                }],
            }],
            optionStockReservedAt: null,
            optionStockRestoredAt: null,
            save: jest.fn().mockResolvedValue(undefined),
        };

        await reserveOptionStockForOrder(order, null);
        expect((await MenuItemChoiceOption.findById(option._id)).stock_quantity).toBe(14);

        await restoreOptionStockForOrder(order, null);
        expect((await MenuItemChoiceOption.findById(option._id)).stock_quantity).toBe(20);

        await restoreOptionStockForOrder(order, null);
        expect((await MenuItemChoiceOption.findById(option._id)).stock_quantity).toBe(20);
    });

    it("rejects reservations larger than remaining stock", async () => {
        const groupId = new mongoose.Types.ObjectId();
        const option = await MenuItemChoiceOption.create({
            group_id: groupId,
            label: "Turkey",
            track_stock: true,
            stock_quantity: 1,
        });
        const order = {
            items: [{ type: "item", quantity: 2, selected_options: [{ group_id: groupId, option_id: option._id, label: "Turkey", quantity: 1, stock_tracked: true }] }],
            save: jest.fn(),
        };
        await expect(reserveOptionStockForOrder(order, null)).rejects.toThrow("Turkey is out of stock");
        expect((await MenuItemChoiceOption.findById(option._id)).stock_quantity).toBe(1);
    });
});
