import mongoose from "mongoose";
import ComboItem from "../model/menu/ComboItem.js";
import { MenuItemChoiceOption } from "../model/menu/MenuItemChoice.js";
import Order from "../model/order/Order.js";

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
