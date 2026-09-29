-- CreateTable
CREATE TABLE "order_broadcast_queue" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "order_id" UUID NOT NULL,
    "vendor_order_id" UUID NOT NULL,
    "city_id" UUID,
    "state_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_attempt_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_broadcast_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_broadcast_queue_legacy_mongo_id_key" ON "order_broadcast_queue"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_broadcast_queue_vendor_order_id_key" ON "order_broadcast_queue"("vendor_order_id");

-- CreateIndex
CREATE INDEX "order_broadcast_queue_status_city_id_queued_at_idx" ON "order_broadcast_queue"("status", "city_id", "queued_at");

-- CreateIndex
CREATE INDEX "order_broadcast_queue_state_id_status_idx" ON "order_broadcast_queue"("state_id", "status");

-- AddForeignKey
ALTER TABLE "order_broadcast_queue" ADD CONSTRAINT "order_broadcast_queue_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_broadcast_queue" ADD CONSTRAINT "order_broadcast_queue_vendor_order_id_fkey" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
