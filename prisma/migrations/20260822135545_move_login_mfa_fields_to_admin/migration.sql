ALTER TABLE "admins"
  ADD COLUMN "login_otp_hash" TEXT,
  ADD COLUMN "login_otp_expires" TIMESTAMP(3),
  ADD COLUMN "login_otp_attempts" INTEGER NOT NULL DEFAULT 0;
