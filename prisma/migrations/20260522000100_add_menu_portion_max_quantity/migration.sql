-- Add max_quantity from the Mongo MenuItemPortion model.
ALTER TABLE "public"."menu_item_portions"
ADD COLUMN "max_quantity" INTEGER;
