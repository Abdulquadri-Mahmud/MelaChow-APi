-- CreateTable
CREATE TABLE IF NOT EXISTS "call_sessions" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "vendor_order_id" UUID NOT NULL,
    "logistics_delivery_id" UUID,
    "external_delivery_id" UUID,
    "customer_id" UUID NOT NULL,
    "rider_id" TEXT NOT NULL,
    "rider_provider" TEXT NOT NULL DEFAULT 'samka',
    "caller_role" TEXT NOT NULL,
    "callee_role" TEXT NOT NULL,
    "customer_display_name" TEXT NOT NULL DEFAULT 'Customer',
    "rider_display_name" TEXT NOT NULL DEFAULT 'Rider',
    "rider_avatar_url" TEXT,
    "order_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'initiating',
    "end_reason" TEXT,
    "ended_by_role" TEXT,
    "ringing_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "connected_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "call_sessions_order_id_status_idx" ON "call_sessions"("order_id", "status");
CREATE INDEX IF NOT EXISTS "call_sessions_vendor_order_id_status_idx" ON "call_sessions"("vendor_order_id", "status");
CREATE INDEX IF NOT EXISTS "call_sessions_external_delivery_id_status_idx" ON "call_sessions"("external_delivery_id", "status");
CREATE INDEX IF NOT EXISTS "call_sessions_customer_id_status_idx" ON "call_sessions"("customer_id", "status");
CREATE INDEX IF NOT EXISTS "call_sessions_rider_id_status_idx" ON "call_sessions"("rider_id", "status");
CREATE INDEX IF NOT EXISTS "call_sessions_status_expires_at_idx" ON "call_sessions"("status", "expires_at");
