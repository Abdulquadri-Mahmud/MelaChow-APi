CREATE TABLE "logistics_deliveries" (
    "id" UUID NOT NULL,
    "vendor_order_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'samka',
    "source" INTEGER NOT NULL DEFAULT 2,
    "source_order_id" TEXT NOT NULL,
    "source_order_reference" TEXT NOT NULL,
    "external_delivery_id" UUID,
    "external_status" INTEGER,
    "dispatch_status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "logistics_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "logistics_deliveries_vendor_order_id_key" ON "logistics_deliveries"("vendor_order_id");
CREATE UNIQUE INDEX "logistics_deliveries_external_delivery_id_key" ON "logistics_deliveries"("external_delivery_id");
CREATE UNIQUE INDEX "logistics_deliveries_provider_source_order_id_key" ON "logistics_deliveries"("provider", "source_order_id");
CREATE INDEX "logistics_deliveries_dispatch_status_next_attempt_at_idx" ON "logistics_deliveries"("dispatch_status", "next_attempt_at");
CREATE INDEX "logistics_deliveries_external_status_last_synced_at_idx" ON "logistics_deliveries"("external_status", "last_synced_at");
ALTER TABLE "logistics_deliveries" ADD CONSTRAINT "logistics_deliveries_vendor_order_id_fkey" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
