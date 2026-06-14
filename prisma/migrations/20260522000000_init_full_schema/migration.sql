-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountRole" AS ENUM ('user', 'vendor', 'rider', 'admin');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('admin', 'super-admin', 'finance-admin');

-- CreateEnum
CREATE TYPE "LocationStatus" AS ENUM ('approved', 'pending_review');

-- CreateEnum
CREATE TYPE "DeliveryManagedBy" AS ENUM ('vendor', 'admin');

-- CreateEnum
CREATE TYPE "RiderStatus" AS ENUM ('available', 'pending_assignment', 'on_delivery', 'offline');

-- CreateEnum
CREATE TYPE "VehicleOwnership" AS ENUM ('own', 'platform');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('bicycle', 'motorbike');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('available', 'assigned', 'maintenance', 'inactive');

-- CreateEnum
CREATE TYPE "DietaryType" AS ENUM ('veg', 'non-veg', 'vegan', 'halal', 'kosher', 'mixed');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('FOOD', 'DRINK', 'SIDE', 'PROTEIN', 'SWALLOW', 'SOUP', 'DESSERT', 'OTHER', 'combo');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CHECKED_OUT', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CartLineItemType" AS ENUM ('PORTION_ITEM', 'VARIANT_ITEM');

-- CreateEnum
CREATE TYPE "CartItemStatusAtAdd" AS ENUM ('AVAILABLE', 'SOLD_OUT', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "OrderItemType" AS ENUM ('item', 'combo');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'accepted', 'preparing', 'ready_for_pickup', 'rider_assigned', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('initialized', 'pending', 'success', 'failed', 'amount_mismatch', 'currency_mismatch', 'provider_mismatch', 'recovered', 'review', 'abandoned');

-- CreateEnum
CREATE TYPE "PaymentRecoveryState" AS ENUM ('awaiting_verification', 'recovered', 'failed', 'review');

-- CreateEnum
CREATE TYPE "WalletOwnerModel" AS ENUM ('Admin', 'Vendor', 'User', 'Rider');

-- CreateEnum
CREATE TYPE "WalletTransactionDirection" AS ENUM ('credit', 'debit');

-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('commission', 'escrow_hold', 'escrow_release', 'delivery_fee', 'rider_payout', 'delivery_spread', 'service_fee', 'refund', 'order_payment', 'top_up', 'manual_credit', 'manual_debit', 'withdrawal');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'reversed');

-- CreateEnum
CREATE TYPE "NotificationRole" AS ENUM ('user', 'vendor', 'admin', 'rider');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('order_placed', 'order_confirmed', 'order_preparing', 'order_ready', 'order_dispatched', 'order_delivered', 'order_cancelled', 'order_assigned', 'rider_order_rejected', 'vendor_new_order', 'vendor_order_cancelled', 'vendor_rider_assigned', 'admin_order_ready', 'admin_order_delivered', 'rider_assignment_needed', 'rider_assignment_accepted', 'rider_assignment_timeout', 'vendor_review', 'support_ticket', 'system', 'promo', 'discount', 'delivery_nearby', 'account_update', 'general');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "DiscountScope" AS ENUM ('GLOBAL_ORDER', 'VENDOR_ORDER', 'SPECIFIC_ITEMS', 'DELIVERY_FEE');

-- CreateEnum
CREATE TYPE "PromoFundedBy" AS ENUM ('PLATFORM', 'VENDOR');

-- CreateEnum
CREATE TYPE "RiderAssignmentStatus" AS ENUM ('pending', 'accepted', 'rejected', 'timeout', 'picked_up', 'delivered');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('open', 'pending', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('pending', 'reviewed', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "states" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "name" TEXT NOT NULL,
    "state_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "platform_delivery_fee_kobo" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parent_id" UUID,
    "description" TEXT NOT NULL DEFAULT '',
    "image" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "firstname" TEXT,
    "lastname" TEXT,
    "full_name" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "phone" TEXT,
    "avatar" TEXT,
    "wallet_balance_kobo" INTEGER NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMP(3),
    "reset_password_token" TEXT,
    "reset_password_expires" TIMESTAMP(3),
    "login_attempts" INTEGER NOT NULL DEFAULT 0,
    "lock_until" TIMESTAMP(3),
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "suspension_reason" TEXT,
    "ban_reason" TEXT,
    "activity_log" JSONB NOT NULL DEFAULT '[]',
    "role" "AccountRole" NOT NULL DEFAULT 'user',
    "otp" TEXT,
    "otp_expires" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_addresses" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "user_id" UUID NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Home',
    "address_line" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "city_id" UUID,
    "state_id" UUID,
    "city_name" TEXT,
    "state_name" TEXT,
    "postal_code" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'admin',
    "reset_password_token" TEXT,
    "reset_password_expires" TIMESTAMP(3),
    "login_attempts" INTEGER NOT NULL DEFAULT 0,
    "lock_until" TIMESTAMP(3),
    "last_login" TIMESTAMP(3),
    "otp" TEXT,
    "otp_expires" TIMESTAMP(3),
    "wallet_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password" TEXT,
    "reset_password_token" TEXT,
    "reset_password_expires" TIMESTAMP(3),
    "login_attempts" INTEGER NOT NULL DEFAULT 0,
    "lock_until" TIMESTAMP(3),
    "last_login" TIMESTAMP(3),
    "otp" TEXT,
    "otp_expires" TIMESTAMP(3),
    "store_name" TEXT NOT NULL,
    "store_slug" TEXT,
    "store_description" TEXT NOT NULL DEFAULT '',
    "logo" TEXT NOT NULL DEFAULT '',
    "cover_image" TEXT NOT NULL DEFAULT '',
    "address" JSONB NOT NULL DEFAULT '{}',
    "state_id" UUID,
    "city_id" UUID,
    "location_status" "LocationStatus",
    "requested_state" TEXT NOT NULL DEFAULT '',
    "requested_city" TEXT NOT NULL DEFAULT '',
    "cuisine_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "opening_hours" JSONB NOT NULL DEFAULT '{}',
    "wallet_id" UUID,
    "payout_details" JSONB,
    "total_sales_kobo" INTEGER NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "commission_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "terms_acceptance" JSONB NOT NULL DEFAULT '{}',
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "has_active_delivery_promo" BOOLEAN NOT NULL DEFAULT false,
    "suspension_reason" TEXT NOT NULL DEFAULT '',
    "accepts_delivery" BOOLEAN NOT NULL DEFAULT true,
    "flat_rate_delivery_fee_kobo" INTEGER NOT NULL DEFAULT 0,
    "delivery_radius_km" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "owner_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deleted_at" TIMESTAMP(3),
    "admin_notes" TEXT NOT NULL DEFAULT '',
    "delivery_managed_by" "DeliveryManagedBy" NOT NULL DEFAULT 'admin',
    "platform_delivery_fee_override_kobo" INTEGER,
    "role" "AccountRole" NOT NULL DEFAULT 'vendor',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "riders" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "avatar" TEXT NOT NULL DEFAULT '',
    "vendor_id" UUID,
    "state_id" UUID,
    "city_id" UUID,
    "location_status" "LocationStatus",
    "requested_state" TEXT NOT NULL DEFAULT '',
    "requested_city" TEXT NOT NULL DEFAULT '',
    "service_zones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vehicle_ownership" "VehicleOwnership" NOT NULL DEFAULT 'own',
    "vehicle_type" "VehicleType" NOT NULL DEFAULT 'bicycle',
    "platform_vehicle_id" UUID,
    "managed_by" "DeliveryManagedBy" NOT NULL DEFAULT 'vendor',
    "password" TEXT,
    "otp" TEXT,
    "otp_expires" TIMESTAMP(3),
    "reset_password_token" TEXT,
    "reset_password_expires" TIMESTAMP(3),
    "login_attempts" INTEGER NOT NULL DEFAULT 0,
    "lock_until" TIMESTAMP(3),
    "last_login" TIMESTAMP(3),
    "status" "RiderStatus" NOT NULL DEFAULT 'offline',
    "current_order_id" UUID,
    "assignment_expires_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "total_deliveries" INTEGER NOT NULL DEFAULT 0,
    "total_earnings" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "payout_details" JSONB NOT NULL DEFAULT '{}',
    "role" "AccountRole" NOT NULL DEFAULT 'rider',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "riders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_vehicles" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "label" TEXT NOT NULL,
    "identifier" TEXT,
    "vehicle_type" "VehicleType" NOT NULL DEFAULT 'bicycle',
    "status" "VehicleStatus" NOT NULL DEFAULT 'available',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_menu_sections" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "vendor_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_menu_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "vendor_id" UUID NOT NULL,
    "platform_category_id" UUID NOT NULL,
    "vendor_section_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "item_type" "ItemType" NOT NULL DEFAULT 'FOOD',
    "dietary_type" "DietaryType" NOT NULL DEFAULT 'mixed',
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_in_stock" BOOLEAN NOT NULL DEFAULT true,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "category_deactivated" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "prep_time_minutes" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_portions" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "menu_item_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "price_kobo" INTEGER NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_in_stock" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_portions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_choice_groups" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "menu_item_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "min_selections" INTEGER NOT NULL DEFAULT 0,
    "max_selections" INTEGER NOT NULL DEFAULT 1,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_choice_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_choice_options" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "group_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "image_url" TEXT,
    "price_modifier" INTEGER NOT NULL DEFAULT 0,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_choice_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo_items" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "vendor_id" UUID NOT NULL,
    "platform_category_id" UUID NOT NULL,
    "vendor_section_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "price_kobo" INTEGER NOT NULL,
    "dietary_type" "DietaryType" NOT NULL DEFAULT 'mixed',
    "prep_time_minutes" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "choice_groups" JSONB NOT NULL DEFAULT '[]',
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_in_stock" BOOLEAN NOT NULL DEFAULT true,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "combo_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "customer_id" UUID NOT NULL,
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_sub_carts" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "cart_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "vendor_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_sub_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_line_items" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "vendor_sub_cart_id" UUID NOT NULL,
    "line_item_type" "CartLineItemType" NOT NULL,
    "menu_item_id" UUID,
    "portion_id" UUID,
    "selected_choices" JSONB NOT NULL DEFAULT '[]',
    "unit_price_kobo" INTEGER,
    "variant_id" UUID,
    "variant_choices" JSONB NOT NULL DEFAULT '[]',
    "base_price_kobo" INTEGER,
    "choices_price_kobo" INTEGER NOT NULL DEFAULT 0,
    "total_price_kobo" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "special_instructions" TEXT,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "item_status_at_add" "CartItemStatusAtAdd" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "user_id" UUID NOT NULL,
    "delivery_address" JSONB NOT NULL,
    "phone" TEXT NOT NULL,
    "subtotal_kobo" INTEGER NOT NULL,
    "delivery_fee_kobo" INTEGER NOT NULL,
    "service_fee_kobo" INTEGER NOT NULL DEFAULT 0,
    "applied_discount" JSONB,
    "free_delivery_promo" JSONB NOT NULL DEFAULT '{}',
    "vendor_delivery_promo" JSONB NOT NULL DEFAULT '{}',
    "total_kobo" INTEGER NOT NULL,
    "order_code" TEXT NOT NULL,
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "payment_reference" TEXT,
    "idempotency_key" TEXT,
    "order_status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "rider_id" UUID,
    "rider_assignment" JSONB NOT NULL DEFAULT '{}',
    "rider_earnings_kobo" INTEGER,
    "status_log" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "order_id" UUID NOT NULL,
    "type" "OrderItemType" NOT NULL DEFAULT 'item',
    "food_id" UUID,
    "portion_id" UUID,
    "variant_id" UUID,
    "restaurant_id" UUID,
    "store_name" TEXT NOT NULL DEFAULT '',
    "variant" JSONB NOT NULL DEFAULT '{}',
    "name" TEXT NOT NULL DEFAULT '',
    "image_url" TEXT NOT NULL DEFAULT '',
    "portion_label" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL,
    "portion_quantity" INTEGER NOT NULL DEFAULT 1,
    "price_kobo" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "dietary_type" "DietaryType",
    "item_type" "ItemType",
    "selected_options" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_delivery_fees" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "delivery_fee_kobo" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_delivery_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_orders" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "restaurant_id" UUID NOT NULL,
    "user_order_id" UUID NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "commission_kobo" INTEGER,
    "vendor_total_kobo" INTEGER,
    "delivery_share_kobo" INTEGER,
    "escrow_amount_kobo" INTEGER NOT NULL DEFAULT 0,
    "escrow_released" BOOLEAN NOT NULL DEFAULT false,
    "order_status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "rider_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "owner_id" UUID NOT NULL,
    "owner_model" "WalletOwnerModel" NOT NULL,
    "balance_kobo" INTEGER NOT NULL DEFAULT 0,
    "total_earned_kobo" INTEGER NOT NULL DEFAULT 0,
    "total_withdrawn_kobo" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "wallet_id" UUID NOT NULL,
    "type" "WalletTransactionDirection" NOT NULL,
    "amount_kobo" INTEGER NOT NULL,
    "transaction_type" "WalletTransactionType",
    "description" TEXT,
    "reporting_amount_kobo" INTEGER,
    "order_id" UUID,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "vendor_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "requested_amount_kobo" INTEGER NOT NULL,
    "transfer_fee_kobo" INTEGER NOT NULL DEFAULT 0,
    "net_amount_kobo" INTEGER NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "paystack_reference" TEXT NOT NULL,
    "paystack_transfer_code" TEXT,
    "recipient_code" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL DEFAULT '',
    "account_number" TEXT NOT NULL DEFAULT '',
    "account_name" TEXT NOT NULL DEFAULT '',
    "failure_reason" TEXT,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_withdrawals" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "rider_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "requested_amount_kobo" INTEGER NOT NULL,
    "transfer_fee_kobo" INTEGER NOT NULL DEFAULT 0,
    "net_amount_kobo" INTEGER NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "paystack_reference" TEXT NOT NULL,
    "paystack_transfer_code" TEXT,
    "recipient_code" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL DEFAULT '',
    "account_number" TEXT NOT NULL DEFAULT '',
    "account_name" TEXT NOT NULL DEFAULT '',
    "failure_reason" TEXT,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "reference" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'paystack',
    "order_id" UUID,
    "order_code" TEXT NOT NULL DEFAULT '',
    "user_id" UUID,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'initialized',
    "expected_amount_kobo" INTEGER NOT NULL DEFAULT 0,
    "legacy_expected_amount_kobo" INTEGER NOT NULL DEFAULT 0,
    "paid_amount_kobo" INTEGER NOT NULL DEFAULT 0,
    "legacy_paid_amount_kobo" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "provider_status" TEXT NOT NULL DEFAULT '',
    "gateway_response" TEXT NOT NULL DEFAULT '',
    "authorization_url" TEXT NOT NULL DEFAULT '',
    "access_code" TEXT NOT NULL DEFAULT '',
    "failure_reason" TEXT NOT NULL DEFAULT '',
    "recovery_state" "PaymentRecoveryState" NOT NULL DEFAULT 'awaiting_verification',
    "order_snapshot" JSONB NOT NULL DEFAULT '{}',
    "cart_snapshot" JSONB NOT NULL DEFAULT '{}',
    "provider_payload" JSONB NOT NULL DEFAULT '{}',
    "events" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_locks" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "reference" TEXT NOT NULL,
    "locked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "order_id" UUID,
    "user_id" UUID,
    "amount_kobo" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "user_id" UUID,
    "vendor_id" UUID,
    "order_id" UUID,
    "reference" TEXT,
    "amount_kobo" INTEGER NOT NULL,
    "type" TEXT,
    "status" TEXT,
    "provider" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "type" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "user_id" UUID,
    "order_id" UUID,
    "payment_reference" TEXT,
    "amount_kobo" INTEGER NOT NULL,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "user_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "food_id" UUID,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "reporter_id" UUID NOT NULL,
    "target_id" UUID,
    "target_model" TEXT,
    "reason" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "ticket_number" TEXT NOT NULL,
    "user_id" UUID,
    "order_id" UUID,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" TEXT,
    "priority" TEXT,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'open',
    "order_reference" TEXT,
    "payment_reference" TEXT,
    "admin_notes" JSONB NOT NULL DEFAULT '[]',
    "timeline" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "user_id" UUID,
    "rider_id" UUID,
    "admin_id" UUID,
    "restaurant_id" UUID,
    "role" "NotificationRole" NOT NULL DEFAULT 'user',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'general',
    "order_id" TEXT,
    "url" TEXT,
    "image" TEXT,
    "icon" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "owner_id" UUID NOT NULL,
    "owner_model" "WalletOwnerModel" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "subscription" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discounts" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "value_kobo" INTEGER NOT NULL,
    "scope" "DiscountScope" NOT NULL,
    "vendor_id" UUID,
    "target_food_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "min_order_amount_kobo" INTEGER NOT NULL DEFAULT 0,
    "max_discount_amount_kobo" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3),
    "usage_limit" INTEGER,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "user_usage_limit" INTEGER NOT NULL DEFAULT 1,
    "funded_by" "PromoFundedBy" NOT NULL DEFAULT 'VENDOR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_usages" (
    "id" UUID NOT NULL,
    "discount_id" UUID NOT NULL,
    "user_id" UUID,
    "order_id" UUID,
    "hashed_device_id" TEXT,
    "phone_hash" TEXT,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "free_delivery_promos" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "max_orders" INTEGER,
    "used_orders" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "free_delivery_promos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "free_delivery_claims" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "promo_id" UUID NOT NULL,
    "user_id" UUID,
    "order_id" UUID,
    "hashed_ip" TEXT,
    "hashed_device_id" TEXT,
    "phone_hash" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "free_delivery_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_delivery_promos" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "vendor_id" UUID NOT NULL,
    "max_orders" INTEGER,
    "used_orders" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_delivery_promos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_delivery_claims" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "promo_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "user_id" UUID,
    "order_id" UUID,
    "hashed_device_id" TEXT,
    "phone_hash" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_delivery_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_assignments" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "order_id" UUID NOT NULL,
    "vendor_order_id" UUID,
    "rider_id" UUID,
    "vendor_id" UUID,
    "city_id" UUID,
    "state_id" UUID,
    "status" "RiderAssignmentStatus" NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "responded_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_trends" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "keyword" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "user_id" UUID,
    "vendor_id" UUID,
    "city_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_trends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "actor_id" UUID,
    "actor_model" TEXT,
    "action" TEXT NOT NULL,
    "target_id" UUID,
    "target_model" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_configs" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "type" TEXT NOT NULL,
    "value" JSONB NOT NULL DEFAULT '{}',
    "last_updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foods" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "vendor_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "images" JSONB NOT NULL DEFAULT '[]',
    "price_kobo" INTEGER NOT NULL,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "portions" JSONB NOT NULL DEFAULT '[]',
    "stock" INTEGER,
    "discount" JSONB NOT NULL DEFAULT '{}',
    "active_promotion_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "availability_schedule" JSONB NOT NULL DEFAULT '{}',
    "allow_instructions" BOOLEAN NOT NULL DEFAULT true,
    "packaging_fee_kobo" INTEGER NOT NULL DEFAULT 0,
    "nutrition" JSONB NOT NULL DEFAULT '{}',
    "prep_time" INTEGER NOT NULL DEFAULT 15,
    "food_type" "DietaryType" NOT NULL DEFAULT 'mixed',
    "choice_groups" JSONB NOT NULL DEFAULT '[]',
    "available" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimated_delivery_time" INTEGER NOT NULL DEFAULT 30,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "variants" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_agents" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT NOT NULL,
    "vehicle_type" "VehicleType" NOT NULL DEFAULT 'bicycle',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "assigned_order_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "earnings_kobo" INTEGER NOT NULL DEFAULT 0,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_deliveries" INTEGER NOT NULL DEFAULT 0,
    "date_joined" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_agents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "states_legacy_mongo_id_key" ON "states"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "states_name_key" ON "states"("name");

-- CreateIndex
CREATE INDEX "states_name_is_active_idx" ON "states"("name", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "cities_legacy_mongo_id_key" ON "cities"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "cities_state_id_is_active_idx" ON "cities"("state_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "cities_name_state_id_key" ON "cities"("name", "state_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_legacy_mongo_id_key" ON "categories"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- CreateIndex
CREATE INDEX "categories_slug_parent_id_idx" ON "categories"("slug", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_legacy_mongo_id_key" ON "users"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "user_addresses_legacy_mongo_id_key" ON "user_addresses"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "user_addresses_user_id_idx" ON "user_addresses"("user_id");

-- CreateIndex
CREATE INDEX "user_addresses_city_id_idx" ON "user_addresses"("city_id");

-- CreateIndex
CREATE INDEX "user_addresses_state_id_idx" ON "user_addresses"("state_id");

-- CreateIndex
CREATE UNIQUE INDEX "admins_legacy_mongo_id_key" ON "admins"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE INDEX "admins_email_idx" ON "admins"("email");

-- CreateIndex
CREATE INDEX "admins_role_idx" ON "admins"("role");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_legacy_mongo_id_key" ON "vendors"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_store_slug_key" ON "vendors"("store_slug");

-- CreateIndex
CREATE INDEX "vendors_email_idx" ON "vendors"("email");

-- CreateIndex
CREATE INDEX "vendors_phone_idx" ON "vendors"("phone");

-- CreateIndex
CREATE INDEX "vendors_store_name_idx" ON "vendors"("store_name");

-- CreateIndex
CREATE INDEX "vendors_state_id_idx" ON "vendors"("state_id");

-- CreateIndex
CREATE INDEX "vendors_city_id_idx" ON "vendors"("city_id");

-- CreateIndex
CREATE INDEX "vendors_location_status_idx" ON "vendors"("location_status");

-- CreateIndex
CREATE INDEX "vendors_verified_idx" ON "vendors"("verified");

-- CreateIndex
CREATE INDEX "vendors_is_approved_idx" ON "vendors"("is_approved");

-- CreateIndex
CREATE INDEX "vendors_active_suspended_idx" ON "vendors"("active", "suspended");

-- CreateIndex
CREATE INDEX "vendors_has_active_delivery_promo_idx" ON "vendors"("has_active_delivery_promo");

-- CreateIndex
CREATE UNIQUE INDEX "riders_legacy_mongo_id_key" ON "riders"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "riders_phone_idx" ON "riders"("phone");

-- CreateIndex
CREATE INDEX "riders_email_idx" ON "riders"("email");

-- CreateIndex
CREATE INDEX "riders_vendor_id_status_idx" ON "riders"("vendor_id", "status");

-- CreateIndex
CREATE INDEX "riders_vendor_id_is_active_deleted_at_idx" ON "riders"("vendor_id", "is_active", "deleted_at");

-- CreateIndex
CREATE INDEX "riders_city_id_status_is_active_is_verified_idx" ON "riders"("city_id", "status", "is_active", "is_verified");

-- CreateIndex
CREATE INDEX "riders_platform_vehicle_id_idx" ON "riders"("platform_vehicle_id");

-- CreateIndex
CREATE INDEX "riders_assignment_expires_at_idx" ON "riders"("assignment_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "platform_vehicles_legacy_mongo_id_key" ON "platform_vehicles"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_vehicles_identifier_key" ON "platform_vehicles"("identifier");

-- CreateIndex
CREATE INDEX "platform_vehicles_status_idx" ON "platform_vehicles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_menu_sections_legacy_mongo_id_key" ON "vendor_menu_sections"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "vendor_menu_sections_vendor_id_is_visible_sort_order_delete_idx" ON "vendor_menu_sections"("vendor_id", "is_visible", "sort_order", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_legacy_mongo_id_key" ON "menu_items"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "menu_items_vendor_id_is_archived_is_available_is_in_stock_idx" ON "menu_items"("vendor_id", "is_archived", "is_available", "is_in_stock");

-- CreateIndex
CREATE INDEX "menu_items_platform_category_id_is_archived_is_available_is_idx" ON "menu_items"("platform_category_id", "is_archived", "is_available", "is_in_stock");

-- CreateIndex
CREATE INDEX "menu_items_vendor_id_vendor_section_id_idx" ON "menu_items"("vendor_id", "vendor_section_id");

-- CreateIndex
CREATE INDEX "menu_items_vendor_id_platform_category_id_idx" ON "menu_items"("vendor_id", "platform_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_portions_legacy_mongo_id_key" ON "menu_item_portions"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "menu_item_portions_menu_item_id_is_available_is_in_stock_idx" ON "menu_item_portions"("menu_item_id", "is_available", "is_in_stock");

-- CreateIndex
CREATE INDEX "menu_item_portions_menu_item_id_is_default_idx" ON "menu_item_portions"("menu_item_id", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_choice_groups_legacy_mongo_id_key" ON "menu_item_choice_groups"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "menu_item_choice_groups_menu_item_id_idx" ON "menu_item_choice_groups"("menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_choice_options_legacy_mongo_id_key" ON "menu_item_choice_options"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "menu_item_choice_options_group_id_idx" ON "menu_item_choice_options"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "combo_items_legacy_mongo_id_key" ON "combo_items"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "combo_items_vendor_id_is_archived_is_available_idx" ON "combo_items"("vendor_id", "is_archived", "is_available");

-- CreateIndex
CREATE INDEX "combo_items_platform_category_id_is_archived_idx" ON "combo_items"("platform_category_id", "is_archived");

-- CreateIndex
CREATE INDEX "combo_items_vendor_id_vendor_section_id_idx" ON "combo_items"("vendor_id", "vendor_section_id");

-- CreateIndex
CREATE UNIQUE INDEX "carts_legacy_mongo_id_key" ON "carts"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "carts_customer_id_status_idx" ON "carts"("customer_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_sub_carts_legacy_mongo_id_key" ON "vendor_sub_carts"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "vendor_sub_carts_vendor_id_idx" ON "vendor_sub_carts"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_sub_carts_cart_id_vendor_id_key" ON "vendor_sub_carts"("cart_id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_line_items_legacy_mongo_id_key" ON "cart_line_items"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "cart_line_items_vendor_sub_cart_id_idx" ON "cart_line_items"("vendor_sub_cart_id");

-- CreateIndex
CREATE INDEX "cart_line_items_menu_item_id_idx" ON "cart_line_items"("menu_item_id");

-- CreateIndex
CREATE INDEX "cart_line_items_portion_id_idx" ON "cart_line_items"("portion_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_legacy_mongo_id_key" ON "orders"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_code_key" ON "orders"("order_code");

-- CreateIndex
CREATE UNIQUE INDEX "orders_payment_reference_key" ON "orders"("payment_reference");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_user_id_created_at_idx" ON "orders"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_user_id_order_status_idx" ON "orders"("user_id", "order_status");

-- CreateIndex
CREATE INDEX "orders_order_status_created_at_idx" ON "orders"("order_status", "created_at");

-- CreateIndex
CREATE INDEX "orders_rider_id_order_status_idx" ON "orders"("rider_id", "order_status");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_legacy_mongo_id_key" ON "order_items"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_restaurant_id_idx" ON "order_items"("restaurant_id");

-- CreateIndex
CREATE INDEX "order_items_food_id_idx" ON "order_items"("food_id");

-- CreateIndex
CREATE INDEX "vendor_delivery_fees_restaurant_id_idx" ON "vendor_delivery_fees"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_delivery_fees_order_id_restaurant_id_key" ON "vendor_delivery_fees"("order_id", "restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_orders_legacy_mongo_id_key" ON "vendor_orders"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "vendor_orders_restaurant_id_created_at_idx" ON "vendor_orders"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX "vendor_orders_restaurant_id_order_status_idx" ON "vendor_orders"("restaurant_id", "order_status");

-- CreateIndex
CREATE INDEX "vendor_orders_user_order_id_idx" ON "vendor_orders"("user_order_id");

-- CreateIndex
CREATE INDEX "vendor_orders_restaurant_id_rider_id_idx" ON "vendor_orders"("restaurant_id", "rider_id");

-- CreateIndex
CREATE INDEX "vendor_orders_rider_id_order_status_idx" ON "vendor_orders"("rider_id", "order_status");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_legacy_mongo_id_key" ON "wallets"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "wallets_owner_model_idx" ON "wallets"("owner_model");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_owner_id_owner_model_key" ON "wallets"("owner_id", "owner_model");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_legacy_mongo_id_key" ON "wallet_transactions"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_date_idx" ON "wallet_transactions"("wallet_id", "date");

-- CreateIndex
CREATE INDEX "wallet_transactions_transaction_type_date_idx" ON "wallet_transactions"("transaction_type", "date");

-- CreateIndex
CREATE INDEX "wallet_transactions_order_id_idx" ON "wallet_transactions"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_legacy_mongo_id_key" ON "withdrawals"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_paystack_reference_key" ON "withdrawals"("paystack_reference");

-- CreateIndex
CREATE INDEX "withdrawals_vendor_id_status_idx" ON "withdrawals"("vendor_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rider_withdrawals_legacy_mongo_id_key" ON "rider_withdrawals"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "rider_withdrawals_paystack_reference_key" ON "rider_withdrawals"("paystack_reference");

-- CreateIndex
CREATE INDEX "rider_withdrawals_rider_id_status_idx" ON "rider_withdrawals"("rider_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_legacy_mongo_id_key" ON "payment_attempts"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_reference_key" ON "payment_attempts"("reference");

-- CreateIndex
CREATE INDEX "payment_attempts_provider_idx" ON "payment_attempts"("provider");

-- CreateIndex
CREATE INDEX "payment_attempts_order_id_idx" ON "payment_attempts"("order_id");

-- CreateIndex
CREATE INDEX "payment_attempts_order_code_idx" ON "payment_attempts"("order_code");

-- CreateIndex
CREATE INDEX "payment_attempts_user_id_created_at_idx" ON "payment_attempts"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_attempts_status_idx" ON "payment_attempts"("status");

-- CreateIndex
CREATE INDEX "payment_attempts_recovery_state_idx" ON "payment_attempts"("recovery_state");

-- CreateIndex
CREATE UNIQUE INDEX "payment_locks_legacy_mongo_id_key" ON "payment_locks"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_locks_reference_key" ON "payment_locks"("reference");

-- CreateIndex
CREATE INDEX "payment_locks_expires_at_idx" ON "payment_locks"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_legacy_mongo_id_key" ON "refunds"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "refunds_created_at_idx" ON "refunds"("created_at");

-- CreateIndex
CREATE INDEX "refunds_user_id_created_at_idx" ON "refunds"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "refunds_order_id_idx" ON "refunds"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_legacy_mongo_id_key" ON "transactions"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_reference_key" ON "transactions"("reference");

-- CreateIndex
CREATE INDEX "transactions_user_id_idx" ON "transactions"("user_id");

-- CreateIndex
CREATE INDEX "transactions_vendor_id_idx" ON "transactions"("vendor_id");

-- CreateIndex
CREATE INDEX "transactions_order_id_idx" ON "transactions"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_legacy_mongo_id_key" ON "invoices"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_user_id_created_at_idx" ON "invoices"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "invoices_order_id_idx" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoices_payment_reference_idx" ON "invoices"("payment_reference");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_legacy_mongo_id_key" ON "reviews"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");

-- CreateIndex
CREATE INDEX "reviews_vendor_id_idx" ON "reviews"("vendor_id");

-- CreateIndex
CREATE INDEX "reviews_food_id_idx" ON "reviews"("food_id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_legacy_mongo_id_key" ON "reports"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "reports_reporter_id_idx" ON "reports"("reporter_id");

-- CreateIndex
CREATE INDEX "reports_target_id_target_model_idx" ON "reports"("target_id", "target_model");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_legacy_mongo_id_key" ON "support_tickets"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_ticket_number_key" ON "support_tickets"("ticket_number");

-- CreateIndex
CREATE INDEX "support_tickets_created_at_idx" ON "support_tickets"("created_at");

-- CreateIndex
CREATE INDEX "support_tickets_status_priority_created_at_idx" ON "support_tickets"("status", "priority", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_category_created_at_idx" ON "support_tickets"("category", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_legacy_mongo_id_key" ON "notifications"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_rider_id_created_at_idx" ON "notifications"("rider_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_admin_id_created_at_idx" ON "notifications"("admin_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_role_created_at_idx" ON "notifications"("role", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_idx" ON "notifications"("user_id", "read");

-- CreateIndex
CREATE INDEX "notifications_rider_id_read_idx" ON "notifications"("rider_id", "read");

-- CreateIndex
CREATE INDEX "notifications_restaurant_id_created_at_idx" ON "notifications"("restaurant_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_restaurant_id_read_idx" ON "notifications"("restaurant_id", "read");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_legacy_mongo_id_key" ON "push_subscriptions"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_owner_id_owner_model_idx" ON "push_subscriptions"("owner_id", "owner_model");

-- CreateIndex
CREATE UNIQUE INDEX "discounts_legacy_mongo_id_key" ON "discounts"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "discounts_code_key" ON "discounts"("code");

-- CreateIndex
CREATE INDEX "discounts_vendor_id_idx" ON "discounts"("vendor_id");

-- CreateIndex
CREATE INDEX "discounts_is_active_start_date_end_date_idx" ON "discounts"("is_active", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "discount_usages_discount_id_user_id_idx" ON "discount_usages"("discount_id", "user_id");

-- CreateIndex
CREATE INDEX "discount_usages_discount_id_hashed_device_id_idx" ON "discount_usages"("discount_id", "hashed_device_id");

-- CreateIndex
CREATE INDEX "discount_usages_discount_id_phone_hash_idx" ON "discount_usages"("discount_id", "phone_hash");

-- CreateIndex
CREATE UNIQUE INDEX "free_delivery_promos_legacy_mongo_id_key" ON "free_delivery_promos"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "free_delivery_promos_is_active_idx" ON "free_delivery_promos"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "free_delivery_claims_legacy_mongo_id_key" ON "free_delivery_claims"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "free_delivery_claims_promo_id_idx" ON "free_delivery_claims"("promo_id");

-- CreateIndex
CREATE INDEX "free_delivery_claims_user_id_idx" ON "free_delivery_claims"("user_id");

-- CreateIndex
CREATE INDEX "free_delivery_claims_hashed_ip_idx" ON "free_delivery_claims"("hashed_ip");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_delivery_promos_legacy_mongo_id_key" ON "vendor_delivery_promos"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "vendor_delivery_promos_vendor_id_is_active_idx" ON "vendor_delivery_promos"("vendor_id", "is_active");

-- CreateIndex
CREATE INDEX "vendor_delivery_promos_created_at_idx" ON "vendor_delivery_promos"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_delivery_claims_legacy_mongo_id_key" ON "vendor_delivery_claims"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "vendor_delivery_claims_promo_id_user_id_idx" ON "vendor_delivery_claims"("promo_id", "user_id");

-- CreateIndex
CREATE INDEX "vendor_delivery_claims_vendor_id_user_id_idx" ON "vendor_delivery_claims"("vendor_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "rider_assignments_legacy_mongo_id_key" ON "rider_assignments"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "rider_assignments_order_id_status_created_at_idx" ON "rider_assignments"("order_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "rider_assignments_rider_id_status_created_at_idx" ON "rider_assignments"("rider_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "rider_assignments_expires_at_idx" ON "rider_assignments"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "search_trends_legacy_mongo_id_key" ON "search_trends"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "search_trends_keyword_idx" ON "search_trends"("keyword");

-- CreateIndex
CREATE INDEX "search_trends_count_idx" ON "search_trends"("count");

-- CreateIndex
CREATE UNIQUE INDEX "activity_logs_legacy_mongo_id_key" ON "activity_logs"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- CreateIndex
CREATE INDEX "activity_logs_actor_id_actor_model_idx" ON "activity_logs"("actor_id", "actor_model");

-- CreateIndex
CREATE INDEX "activity_logs_target_id_target_model_idx" ON "activity_logs"("target_id", "target_model");

-- CreateIndex
CREATE UNIQUE INDEX "platform_configs_legacy_mongo_id_key" ON "platform_configs"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_configs_type_key" ON "platform_configs"("type");

-- CreateIndex
CREATE INDEX "platform_configs_last_updated_by_idx" ON "platform_configs"("last_updated_by");

-- CreateIndex
CREATE UNIQUE INDEX "foods_legacy_mongo_id_key" ON "foods"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "foods_slug_key" ON "foods"("slug");

-- CreateIndex
CREATE INDEX "foods_vendor_id_idx" ON "foods"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_agents_legacy_mongo_id_key" ON "delivery_agents"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_agents_phone_key" ON "delivery_agents"("phone");

-- CreateIndex
CREATE INDEX "delivery_agents_phone_idx" ON "delivery_agents"("phone");

-- CreateIndex
CREATE INDEX "delivery_agents_is_available_idx" ON "delivery_agents"("is_available");

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_platform_vehicle_id_fkey" FOREIGN KEY ("platform_vehicle_id") REFERENCES "platform_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_menu_sections" ADD CONSTRAINT "vendor_menu_sections_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_platform_category_id_fkey" FOREIGN KEY ("platform_category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_vendor_section_id_fkey" FOREIGN KEY ("vendor_section_id") REFERENCES "vendor_menu_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_portions" ADD CONSTRAINT "menu_item_portions_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_choice_groups" ADD CONSTRAINT "menu_item_choice_groups_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_choice_options" ADD CONSTRAINT "menu_item_choice_options_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "menu_item_choice_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_platform_category_id_fkey" FOREIGN KEY ("platform_category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_vendor_section_id_fkey" FOREIGN KEY ("vendor_section_id") REFERENCES "vendor_menu_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_sub_carts" ADD CONSTRAINT "vendor_sub_carts_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_sub_carts" ADD CONSTRAINT "vendor_sub_carts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_line_items" ADD CONSTRAINT "cart_line_items_vendor_sub_cart_id_fkey" FOREIGN KEY ("vendor_sub_cart_id") REFERENCES "vendor_sub_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_line_items" ADD CONSTRAINT "cart_line_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_line_items" ADD CONSTRAINT "cart_line_items_portion_id_fkey" FOREIGN KEY ("portion_id") REFERENCES "menu_item_portions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_line_items" ADD CONSTRAINT "cart_line_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "combo_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_portion_id_fkey" FOREIGN KEY ("portion_id") REFERENCES "menu_item_portions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "combo_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_delivery_fees" ADD CONSTRAINT "vendor_delivery_fees_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_delivery_fees" ADD CONSTRAINT "vendor_delivery_fees_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_user_order_id_fkey" FOREIGN KEY ("user_order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_orders" ADD CONSTRAINT "vendor_orders_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_withdrawals" ADD CONSTRAINT "rider_withdrawals_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_withdrawals" ADD CONSTRAINT "rider_withdrawals_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_usages" ADD CONSTRAINT "discount_usages_discount_id_fkey" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_usages" ADD CONSTRAINT "discount_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_usages" ADD CONSTRAINT "discount_usages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "free_delivery_claims" ADD CONSTRAINT "free_delivery_claims_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "free_delivery_promos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "free_delivery_claims" ADD CONSTRAINT "free_delivery_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "free_delivery_claims" ADD CONSTRAINT "free_delivery_claims_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_delivery_promos" ADD CONSTRAINT "vendor_delivery_promos_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_delivery_claims" ADD CONSTRAINT "vendor_delivery_claims_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "vendor_delivery_promos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_delivery_claims" ADD CONSTRAINT "vendor_delivery_claims_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_delivery_claims" ADD CONSTRAINT "vendor_delivery_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_delivery_claims" ADD CONSTRAINT "vendor_delivery_claims_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_assignments" ADD CONSTRAINT "rider_assignments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_assignments" ADD CONSTRAINT "rider_assignments_vendor_order_id_fkey" FOREIGN KEY ("vendor_order_id") REFERENCES "vendor_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_assignments" ADD CONSTRAINT "rider_assignments_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_assignments" ADD CONSTRAINT "rider_assignments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_assignments" ADD CONSTRAINT "rider_assignments_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_assignments" ADD CONSTRAINT "rider_assignments_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_trends" ADD CONSTRAINT "search_trends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_trends" ADD CONSTRAINT "search_trends_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_trends" ADD CONSTRAINT "search_trends_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_configs" ADD CONSTRAINT "platform_configs_last_updated_by_fkey" FOREIGN KEY ("last_updated_by") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foods" ADD CONSTRAINT "foods_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
