ALTER TABLE "vendors" ALTER COLUMN "delivery_radius_km" SET DEFAULT 15;
UPDATE "vendors" SET "delivery_radius_km" = 15 WHERE "delivery_radius_km" = 5;
