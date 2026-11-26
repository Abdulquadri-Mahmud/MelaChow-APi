-- AlterTable: track reward credits spent on orders (food subtotal only)
ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "reward_credit_kobo" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: referral_codes
CREATE TABLE IF NOT EXISTS "referral_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "monthly_cap_override" INTEGER,
    "disabled_reason" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "referral_codes_user_id_key" ON "referral_codes"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "referral_codes_code_key" ON "referral_codes"("code");
CREATE INDEX IF NOT EXISTS "referral_codes_code_is_active_idx" ON "referral_codes"("code", "is_active");

-- CreateTable: referral_attributions
CREATE TABLE IF NOT EXISTS "referral_attributions" (
    "id" UUID NOT NULL,
    "referrer_user_id" UUID NOT NULL,
    "referee_user_id" UUID NOT NULL,
    "referral_code_id" UUID NOT NULL,
    "referral_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'attributed',
    "qualifying_order_id" UUID,
    "qualifying_order_code" TEXT NOT NULL DEFAULT '',
    "qualifying_subtotal_kobo" INTEGER NOT NULL DEFAULT 0,
    "referrer_reward_kobo" INTEGER NOT NULL DEFAULT 0,
    "referee_reward_kobo" INTEGER NOT NULL DEFAULT 0,
    "signup_device_hash" TEXT,
    "signup_ip_hash" TEXT,
    "referee_phone_hash" TEXT,
    "referee_email_canonical" TEXT,
    "checkout_device_hash" TEXT,
    "checkout_address_hash" TEXT,
    "fraud_flags" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "rejection_reason" TEXT NOT NULL DEFAULT '',
    "reviewed_by_admin_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "attributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "qualified_at" TIMESTAMP(3),
    "rewarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_attributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "referral_attributions_referee_user_id_key" ON "referral_attributions"("referee_user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "referral_attributions_qualifying_order_id_key" ON "referral_attributions"("qualifying_order_id");
CREATE INDEX IF NOT EXISTS "referral_attributions_referrer_user_id_status_idx" ON "referral_attributions"("referrer_user_id", "status");
CREATE INDEX IF NOT EXISTS "referral_attributions_referrer_user_id_rewarded_at_idx" ON "referral_attributions"("referrer_user_id", "rewarded_at");
CREATE INDEX IF NOT EXISTS "referral_attributions_status_expires_at_idx" ON "referral_attributions"("status", "expires_at");
CREATE INDEX IF NOT EXISTS "referral_attributions_signup_ip_hash_created_at_idx" ON "referral_attributions"("signup_ip_hash", "created_at");
CREATE INDEX IF NOT EXISTS "referral_attributions_signup_device_hash_idx" ON "referral_attributions"("signup_device_hash");
CREATE INDEX IF NOT EXISTS "referral_attributions_referee_phone_hash_idx" ON "referral_attributions"("referee_phone_hash");
CREATE INDEX IF NOT EXISTS "referral_attributions_checkout_address_hash_idx" ON "referral_attributions"("checkout_address_hash");

-- CreateTable: reward_credit_ledgers
CREATE TABLE IF NOT EXISTS "reward_credit_ledgers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'referral_referrer',
    "source_ref_id" TEXT NOT NULL,
    "attribution_id" UUID,
    "original_amount_kobo" INTEGER NOT NULL,
    "remaining_amount_kobo" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "expiring_notified_at" TIMESTAMP(3),
    "revoked_by_admin_id" TEXT,
    "revoked_reason" TEXT NOT NULL DEFAULT '',
    "redemptions" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_credit_ledgers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "reward_credit_ledgers_source_ref_id_key" ON "reward_credit_ledgers"("source_ref_id");
CREATE INDEX IF NOT EXISTS "reward_credit_ledgers_user_id_status_expires_at_idx" ON "reward_credit_ledgers"("user_id", "status", "expires_at");
CREATE INDEX IF NOT EXISTS "reward_credit_ledgers_status_expires_at_idx" ON "reward_credit_ledgers"("status", "expires_at");
