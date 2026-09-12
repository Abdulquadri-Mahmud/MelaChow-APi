import logger from "../config/logger.js";
import { usePostgresOrderStatusWrites } from "../services/postgres/compat.js";
import { vendorOrdersRepository } from "../services/postgres/vendorOrders.repository.js";

export const cancelStalePostgresOrders = async () => {
  if (!usePostgresOrderStatusWrites()) return [];

  const olderThanMinutes = Number(process.env.VENDOR_ORDER_AUTO_CANCEL_MINUTES || 10);
  const results = await vendorOrdersRepository.autoCancelStalePendingOrders({ olderThanMinutes });
  const cancelled = results.filter((result) => result.success);
  const failed = results.filter((result) => !result.success);

  if (cancelled.length) logger.info({ orders: cancelled }, "Stale PostgreSQL orders auto-cancelled and refunded");
  if (failed.length) logger.error({ orders: failed }, "Some PostgreSQL order timeout cancellations failed");
  return results;
};
