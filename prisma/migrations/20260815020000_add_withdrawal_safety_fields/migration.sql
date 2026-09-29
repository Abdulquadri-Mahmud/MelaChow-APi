ALTER TABLE "withdrawals"
  ADD COLUMN "wallet_debited_at" TIMESTAMP(3), ADD COLUMN "funds_restored_at" TIMESTAMP(3),
  ADD COLUMN "retry_of_id" UUID, ADD COLUMN "active_payout_key" TEXT,
  ADD COLUMN "applied_markup_kobo" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "provider_status" TEXT, ADD COLUMN "provider_failure_reason" TEXT,
  ADD COLUMN "provider_transferred_at" TIMESTAMP(3), ADD COLUMN "last_verified_at" TIMESTAMP(3),
  ADD COLUMN "reconciliation_status" TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN "reconciliation_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_provider_payload" JSONB, ADD COLUMN "reconciliation_history" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "rider_withdrawals"
  ADD COLUMN "wallet_debited_at" TIMESTAMP(3), ADD COLUMN "funds_restored_at" TIMESTAMP(3),
  ADD COLUMN "retry_of_id" UUID, ADD COLUMN "active_payout_key" TEXT,
  ADD COLUMN "applied_markup_kobo" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "provider_status" TEXT, ADD COLUMN "provider_failure_reason" TEXT,
  ADD COLUMN "provider_transferred_at" TIMESTAMP(3), ADD COLUMN "last_verified_at" TIMESTAMP(3),
  ADD COLUMN "reconciliation_status" TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN "reconciliation_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_provider_payload" JSONB, ADD COLUMN "reconciliation_history" JSONB NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX "withdrawals_retry_of_id_key" ON "withdrawals"("retry_of_id");
CREATE UNIQUE INDEX "withdrawals_active_payout_key_key" ON "withdrawals"("active_payout_key");
CREATE UNIQUE INDEX "rider_withdrawals_retry_of_id_key" ON "rider_withdrawals"("retry_of_id");
CREATE UNIQUE INDEX "rider_withdrawals_active_payout_key_key" ON "rider_withdrawals"("active_payout_key");
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_retry_of_id_fkey" FOREIGN KEY ("retry_of_id") REFERENCES "withdrawals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rider_withdrawals" ADD CONSTRAINT "rider_withdrawals_retry_of_id_fkey" FOREIGN KEY ("retry_of_id") REFERENCES "rider_withdrawals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
