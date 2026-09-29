ALTER TABLE "orders"
  ADD COLUMN "restaurant_notes" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "option_stock_reserved_at" TIMESTAMP(3),
  ADD COLUMN "option_stock_restored_at" TIMESTAMP(3),
  ADD COLUMN "portion_stock_reserved_at" TIMESTAMP(3),
  ADD COLUMN "portion_stock_restored_at" TIMESTAMP(3);

ALTER TABLE "order_items"
  ADD COLUMN "meal_group_label" TEXT NOT NULL DEFAULT '';

ALTER TABLE "vendor_orders"
  ADD COLUMN "customer_note" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "city_id" TEXT,
  ADD COLUMN "state_id" TEXT;

CREATE INDEX "vendor_orders_city_id_state_id_order_status_idx"
  ON "vendor_orders"("city_id", "state_id", "order_status");
