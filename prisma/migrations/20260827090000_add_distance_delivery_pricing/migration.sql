ALTER TABLE "cities" ADD COLUMN "distance_delivery_config" JSONB;

ALTER TABLE "user_addresses"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "provider_place_id" TEXT,
  ADD COLUMN "formatted_address" TEXT,
  ADD COLUMN "location_source" TEXT,
  ADD COLUMN "location_verified_at" TIMESTAMP(3);

ALTER TABLE "vendors"
  ADD COLUMN "pickup_latitude" DOUBLE PRECISION,
  ADD COLUMN "pickup_longitude" DOUBLE PRECISION,
  ADD COLUMN "pickup_place_id" TEXT,
  ADD COLUMN "pickup_formatted_address" TEXT,
  ADD COLUMN "pickup_location_verified_at" TIMESTAMP(3),
  ADD COLUMN "delivery_radius_override_km" DOUBLE PRECISION;

ALTER TABLE "vendor_delivery_fees"
  ADD COLUMN "distance_meters" INTEGER,
  ADD COLUMN "pricing_snapshot" JSONB NOT NULL DEFAULT '{}';

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS postgis';
    EXECUTE 'ALTER TABLE "user_addresses" ADD COLUMN "location" geography(Point, 4326)';
    EXECUTE 'ALTER TABLE "vendors" ADD COLUMN "pickup_location" geography(Point, 4326)';
    EXECUTE 'CREATE INDEX "user_addresses_location_gist_idx" ON "user_addresses" USING GIST ("location")';
    EXECUTE 'CREATE INDEX "vendors_pickup_location_gist_idx" ON "vendors" USING GIST ("pickup_location")';
    EXECUTE 'UPDATE "user_addresses" SET "location" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL';
  END IF;
END $migration$;
