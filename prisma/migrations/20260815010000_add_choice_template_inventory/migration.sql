ALTER TABLE "menu_item_choice_options"
  ADD COLUMN "source_template_option_id" TEXT,
  ADD COLUMN "track_stock" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stock_quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "low_stock_threshold" INTEGER NOT NULL DEFAULT 5;

CREATE INDEX "menu_item_choice_options_source_template_option_id_idx"
  ON "menu_item_choice_options"("source_template_option_id");

CREATE TABLE "choice_group_templates" (
  "id" UUID NOT NULL,
  "legacy_mongo_id" TEXT,
  "vendor_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "is_required" BOOLEAN NOT NULL DEFAULT false,
  "min_selections" INTEGER NOT NULL DEFAULT 0,
  "max_selections" INTEGER NOT NULL DEFAULT 1,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_archived" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "choice_group_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "choice_group_templates_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "choice_group_templates_legacy_mongo_id_key" ON "choice_group_templates"("legacy_mongo_id");
CREATE INDEX "choice_group_templates_vendor_id_is_archived_sort_order_created_at_idx" ON "choice_group_templates"("vendor_id", "is_archived", "sort_order", "created_at");
CREATE INDEX "choice_group_templates_vendor_id_name_idx" ON "choice_group_templates"("vendor_id", "name");

CREATE TABLE "choice_group_template_options" (
  "id" UUID NOT NULL,
  "legacy_mongo_id" TEXT,
  "template_id" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "price_modifier" INTEGER NOT NULL DEFAULT 0,
  "image_url" TEXT,
  "is_available" BOOLEAN NOT NULL DEFAULT true,
  "track_stock" BOOLEAN NOT NULL DEFAULT false,
  "stock_quantity" INTEGER NOT NULL DEFAULT 0,
  "low_stock_threshold" INTEGER NOT NULL DEFAULT 5,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "choice_group_template_options_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "choice_group_template_options_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "choice_group_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "choice_group_template_options_legacy_mongo_id_key" ON "choice_group_template_options"("legacy_mongo_id");
CREATE INDEX "choice_group_template_options_template_id_sort_order_idx" ON "choice_group_template_options"("template_id", "sort_order");
