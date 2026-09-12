-- CreateTable
CREATE TABLE "order_terminations" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "order_id" UUID NOT NULL,
    "vendor_order_id" UUID NOT NULL,
    "previous_rider_id" UUID NOT NULL,
    "previous_rider_name" TEXT NOT NULL,
    "previous_rider_phone" TEXT NOT NULL,
    "food_picked_up" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "rider_note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "new_rider_id" UUID,
    "terminated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_terminations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_terminations_legacy_mongo_id_key" ON "order_terminations"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "order_terminations_order_id_created_at_idx" ON "order_terminations"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "order_terminations_vendor_order_id_idx" ON "order_terminations"("vendor_order_id");

-- CreateIndex
CREATE INDEX "order_terminations_previous_rider_id_status_idx" ON "order_terminations"("previous_rider_id", "status");

-- CreateIndex
CREATE INDEX "order_terminations_new_rider_id_idx" ON "order_terminations"("new_rider_id");

-- AddForeignKey
ALTER TABLE "order_terminations" ADD CONSTRAINT "order_terminations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_terminations" ADD CONSTRAINT "order_terminations_vendor_order_id_fkey" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_terminations" ADD CONSTRAINT "order_terminations_previous_rider_id_fkey" FOREIGN KEY ("previous_rider_id") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_terminations" ADD CONSTRAINT "order_terminations_new_rider_id_fkey" FOREIGN KEY ("new_rider_id") REFERENCES "riders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
