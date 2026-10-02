ALTER TABLE "logistics_deliveries"
  ADD COLUMN "assigned_rider" JSONB,
  ADD COLUMN "rider_location" JSONB;

CREATE TABLE "logistics_callback_events" (
  "id" UUID NOT NULL,
  "event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "external_delivery_id" UUID,
  "source_order_id" TEXT,
  "payload" JSONB NOT NULL,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "logistics_callback_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "logistics_callback_events_event_id_key" ON "logistics_callback_events"("event_id");
CREATE INDEX "logistics_callback_events_external_delivery_id_created_at_idx" ON "logistics_callback_events"("external_delivery_id", "created_at");
CREATE INDEX "logistics_callback_events_event_type_created_at_idx" ON "logistics_callback_events"("event_type", "created_at");
