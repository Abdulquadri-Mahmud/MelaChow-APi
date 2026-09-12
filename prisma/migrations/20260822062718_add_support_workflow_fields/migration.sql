-- DropIndex
DROP INDEX "menu_item_choice_groups_source_template_id_idx";

-- DropIndex
DROP INDEX "vendor_orders_city_id_state_id_order_status_idx";

-- DropIndex
DROP INDEX "vendors_is_live_idx";

-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN     "assigned_admin_id" UUID,
ADD COLUMN     "assigned_admin_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "conversation" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "customer_email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "customer_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "customer_phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "evidence" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "first_responded_at" TIMESTAMP(3),
ADD COLUMN     "first_response_due_at" TIMESTAMP(3),
ADD COLUMN     "last_admin_activity_at" TIMESTAMP(3),
ADD COLUMN     "last_customer_activity_at" TIMESTAMP(3),
ADD COLUMN     "reopened_at" TIMESTAMP(3),
ADD COLUMN     "requested_resolution" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "resolution_due_at" TIMESTAMP(3),
ADD COLUMN     "resolved_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "support_refund_settlements" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "ticket_id" UUID NOT NULL,
    "order_id" UUID,
    "customer_id" UUID,
    "refund_amount_kobo" BIGINT NOT NULL,
    "decision" TEXT NOT NULL,
    "liabilities" JSONB NOT NULL DEFAULT '[]',
    "reason" TEXT,
    "evidence_summary" TEXT,
    "approved_by" UUID,
    "approved_by_name" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_refund_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_refund_settlements_legacy_mongo_id_key" ON "support_refund_settlements"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_refund_settlements_ticket_id_key" ON "support_refund_settlements"("ticket_id");

-- CreateIndex
CREATE INDEX "support_refund_settlements_order_id_idx" ON "support_refund_settlements"("order_id");

-- CreateIndex
CREATE INDEX "support_refund_settlements_customer_id_idx" ON "support_refund_settlements"("customer_id");

-- AddForeignKey
ALTER TABLE "support_refund_settlements" ADD CONSTRAINT "support_refund_settlements_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_refund_settlements" ADD CONSTRAINT "support_refund_settlements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_refund_settlements" ADD CONSTRAINT "support_refund_settlements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "choice_group_templates_vendor_id_is_archived_sort_order_created" RENAME TO "choice_group_templates_vendor_id_is_archived_sort_order_cre_idx";
