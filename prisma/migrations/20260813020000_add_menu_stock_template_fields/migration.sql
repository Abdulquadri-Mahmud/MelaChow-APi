ALTER TABLE "menu_item_portions"
  ADD COLUMN "track_stock" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stock_quantity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "low_stock_threshold" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "menu_item_choice_groups"
  ADD COLUMN "source_template_id" TEXT;

CREATE INDEX "menu_item_choice_groups_source_template_id_idx"
  ON "menu_item_choice_groups"("source_template_id");
