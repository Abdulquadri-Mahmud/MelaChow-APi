ALTER TABLE "payment_attempts"
  ALTER COLUMN "expected_amount_kobo" TYPE BIGINT,
  ALTER COLUMN "legacy_expected_amount_kobo" TYPE BIGINT,
  ALTER COLUMN "paid_amount_kobo" TYPE BIGINT,
  ALTER COLUMN "legacy_paid_amount_kobo" TYPE BIGINT;

ALTER TABLE "refunds"
  ALTER COLUMN "amount_kobo" TYPE BIGINT;

ALTER TABLE "transactions"
  ALTER COLUMN "amount_kobo" TYPE BIGINT;

ALTER TABLE "invoices"
  ALTER COLUMN "amount_kobo" TYPE BIGINT;
