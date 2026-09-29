CREATE TABLE "delivery_otp_sessions" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_otp_sessions_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "delivery_otp_sessions_expires_at_idx"
    ON "delivery_otp_sessions"("expires_at");
