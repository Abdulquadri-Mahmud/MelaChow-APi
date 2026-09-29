-- AlterTable
ALTER TABLE "users" ADD COLUMN     "login_otp_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "login_otp_expires" TIMESTAMP(3),
ADD COLUMN     "login_otp_hash" TEXT;
