import mongoose from "mongoose";
import ComboItem from "../model/menu/ComboItem.js";
import { MenuItemChoiceOption } from "../model/menu/MenuItemChoice.js";
import Order from "../model/order/Order.js";
import MenuItem from "../model/menu/MenuItem.js";
import MenuItemPortion from "../model/menu/MenuItemPortion.js";

const requiredUnits = (item, choice) =>
  Math.max(1, Number(item.quantity) || 1) * Math.max(1, Number(choice.quantity) || 1);

export const reserveOptionStockForOrder = async (order, session) => {
  if (!order || (order.optionStockReservedAt && !order.optionStockRestoredAt)) return order;

  for (const item of order.items || []) {
    for (const choice of item.selected_options || []) {
      if (!choice.stock_tracked) continue;
      const units = requiredUnits(item, choice);

      if (item.type === "combo") {
        const result = await ComboItem.updateOne(
          { _id: item.variantId, is_archived: { $ne: true } },
          { $inc: { "choice_groups.$[group].options.$[option].stock_quantity": -units } },
          {
            session,
            arrayFilters: [
              { "group._id": choice.group_id },
              {
                "option._id": choice.option_id,
                "option.track_stock": true,
                "option.is_available": { $ne: false },
                "option.stock_quantity": { $gte: units },
              },
            ],
          }
        );
        if (result.modifiedCount !== 1) throw new Error(`${choice.label} is out of stock`);
      } else {
        const result = await MenuItemChoiceOption.updateOne(
          {
            _id: choice.option_id,
            group_id: choice.group_id,
            track_stock: true,
            is_available: { $ne: false },
            stock_quantity: { $gte: units },
          },
          { $inc: { stock_quantity: -units } },
          { session }
        );
        if (result.modifiedCount !== 1) throw new Error(`${choice.label} is out of stock`);
      }
    }
  }

  order.optionStockReservedAt = new Date();
  order.optionStockRestoredAt = null;
  await order.save({ session });
  return order;
};

export const restoreOptionStockForOrder = async (order, session) => {
  if (!order?.optionStockReservedAt || order.optionStockRestoredAt) return order;

  for (const item of order.items || []) {
    for (const choice of item.selected_options || []) {
      if (!choice.stock_tracked) continue;
      const units = requiredUnits(item, choice);

      if (item.type === "combo") {
        await ComboItem.updateOne(
          { _id: item.variantId },
          { $inc: { "choice_groups.$[group].options.$[option].stock_quantity": units } },
          {
            session,
            arrayFilters: [
              { "group._id": choice.group_id },
              { "option._id": choice.option_id, "option.track_stock": true },
            ],
          }
        );
      } else {
        await MenuItemChoiceOption.updateOne(
          { _id: choice.option_id, group_id: choice.group_id, track_stock: true },
          { $inc: { stock_quantity: units } },
          { session }
        );
      }
    }
  }

  order.optionStockRestoredAt = new Date();
  await order.save({ session });
  return order;
};

const portionUnits = (item) => Math.max(1, Number(item.quantity) || 1);

const syncMenuItemStockStatus = async (menuItemIds, session) => {
  for (const menuItemId of menuItemIds) {
    const availablePortion = await MenuItemPortion.exists({
      menu_item_id: menuItemId,
      is_available: true,
      $or: [
        { track_stock: { $ne: true }, is_in_stock: true },
        { track_stock: true, stock_quantity: { $gt: 0 } },
      ],
    }).session(session);
    await MenuItem.updateOne(
      { _id: menuItemId },
      { $set: { is_in_stock: Boolean(availablePortion) } },
      { session }
    );
  }
};

export const reservePortionStockForOrder = async (order, session) => {
  if (!order || (order.portionStockReservedAt && !order.portionStockRestoredAt)) return order;

  const affectedMenuItemIds = new Set();
  for (const item of order.items || []) {
    if (item.type === "combo" || !item.portionId) continue;

    const units = portionUnits(item);
    const portion = await MenuItemPortion.findById(item.portionId).session(session).lean();
    if (!portion?.track_stock) continue;

    const result = await MenuItemPortion.updateOne(
      {
        _id: item.portionId,
        menu_item_id: item.foodId,
        is_available: true,
        is_in_stock: true,
        track_stock: true,
        stock_quantity: { $gte: units },
      },
      { $inc: { stock_quantity: -units } },
      { session }
    );
    if (result.modifiedCount !== 1) throw new Error(`${item.name}: ${item.portion_label} is out of stock`);

    await MenuItemPortion.updateOne(
      { _id: item.portionId, track_stock: true, stock_quantity: 0 },
      { $set: { is_in_stock: false } },
      { session }
    );
    affectedMenuItemIds.add(String(item.foodId));
  }

  await syncMenuItemStockStatus(affectedMenuItemIds, session);
  order.portionStockReservedAt = new Date();
  order.portionStockRestoredAt = null;
  await order.save({ session });
  return order;
};

export const restorePortionStockForOrder = async (order, session) => {
  if (!order?.portionStockReservedAt || order.portionStockRestoredAt) return order;

  const affectedMenuItemIds = new Set();
  for (const item of order.items || []) {
    if (item.type === "combo" || !item.portionId) continue;

    const portion = await MenuItemPortion.findById(item.portionId).session(session).lean();
    if (!portion?.track_stock) continue;

    await MenuItemPortion.updateOne(
      { _id: item.portionId, track_stock: true },
      { $inc: { stock_quantity: portionUnits(item) }, $set: { is_in_stock: true } },
      { session }
    );
    affectedMenuItemIds.add(String(item.foodId));
  }

  await syncMenuItemStockStatus(affectedMenuItemIds, session);
  order.portionStockRestoredAt = new Date();
  await order.save({ session });
  return order;
};

export const releaseExpiredPortionStockReservations = async ({ maxAgeMinutes = 45, limit = 100 } = {}) => {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  const ids = await Order.find({
    paymentStatus: "pending",
    portionStockReservedAt: { $ne: null, $lte: cutoff },
    portionStockRestoredAt: null,
  }).select("_id").limit(limit).lean();

  let released = 0;
  for (const { _id } of ids) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const order = await Order.findOne({
        _id,
        paymentStatus: "pending",
        portionStockReservedAt: { $ne: null, $lte: cutoff },
        portionStockRestoredAt: null,
      }).session(session);
      if (order) {
        await restorePortionStockForOrder(order, session);
        released += 1;
      }
      await session.commitTransaction();
    } catch (error) {
      if (session.inTransaction()) await session.abortTransaction();
      if (!String(error?.message || "").includes("Write conflict")) throw error;
    } finally {
      session.endSession();
    }
  }
  return released;
};
export const releaseExpiredOptionStockReservations = async ({ maxAgeMinutes = 45, limit = 100 } = {}) => {
  const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
  const ids = await Order.find({
    paymentStatus: "pending",
    optionStockReservedAt: { $ne: null, $lte: cutoff },
    optionStockRestoredAt: null,
  }).select("_id").limit(limit).lean();

  let released = 0;
  for (const { _id } of ids) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const order = await Order.findOne({
        _id,
        paymentStatus: "pending",
        optionStockReservedAt: { $ne: null, $lte: cutoff },
        optionStockRestoredAt: null,
      }).session(session);
      if (order) {
        await restoreOptionStockForOrder(order, session);
        released += 1;
      }
      await session.commitTransaction();
    } catch (error) {
      if (session.inTransaction()) await session.abortTransaction();
      if (!String(error?.message || "").includes("Write conflict")) throw error;
    } finally {
      session.endSession();
    }
  }
  return released;
};
