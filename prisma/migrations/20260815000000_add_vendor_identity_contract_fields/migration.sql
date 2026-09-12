ALTER TABLE "vendors"
  ADD COLUMN "password_setup_token" TEXT,
  ADD COLUMN "password_setup_expires" TIMESTAMP(3),
  ADD COLUMN "is_live" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "published_at" TIMESTAMP(3),
  ADD COLUMN "payout_fee_override" JSONB;

CREATE INDEX "vendors_is_live_idx" ON "vendors"("is_live");
