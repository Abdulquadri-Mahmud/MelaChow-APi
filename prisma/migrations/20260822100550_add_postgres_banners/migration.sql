-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "legacy_mongo_id" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "banner_type" TEXT NOT NULL,
    "content_style" TEXT NOT NULL,
    "image_url" TEXT NOT NULL DEFAULT '',
    "mobile_image_url" TEXT NOT NULL DEFAULT '',
    "background_gradient" JSONB NOT NULL DEFAULT '{}',
    "background_color" TEXT NOT NULL DEFAULT '',
    "text_color" TEXT NOT NULL DEFAULT '',
    "accent_color" TEXT NOT NULL DEFAULT '',
    "cta_text" TEXT NOT NULL DEFAULT '',
    "cta_link" TEXT NOT NULL DEFAULT '',
    "linked_restaurant_id" UUID,
    "linked_category_id" UUID,
    "icon" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "banners_legacy_mongo_id_key" ON "banners"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "banners_is_active_display_order_start_date_end_date_idx" ON "banners"("is_active", "display_order", "start_date", "end_date");

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_linked_restaurant_id_fkey" FOREIGN KEY ("linked_restaurant_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_linked_category_id_fkey" FOREIGN KEY ("linked_category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banners" ADD CONSTRAINT "banners_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
