import prisma from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/index.js";

let postgisAvailable;
export const hasPostgis = async () => {
  if (postgisAvailable !== undefined) return postgisAvailable;
  const rows = await prisma.$queryRawUnsafe("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS installed");
  postgisAvailable = Boolean(rows[0]?.installed);
  return postgisAvailable;
};

export const syncUserAddressPoint = async ({ id, latitude, longitude }) => {
  if (!(await hasPostgis())) return false;
  await prisma.$executeRaw`UPDATE "user_addresses" SET "location" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography WHERE "id" = ${id}::uuid`;
  return true;
};

export const syncVendorPickupPoint = async ({ id, latitude, longitude }) => {
  if (!(await hasPostgis())) return false;
  await prisma.$executeRaw`UPDATE "vendors" SET "pickup_location" = ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography WHERE "id" = ${id}::uuid`;
  return true;
};

export const getPostgisDistancesFromAddress = async ({ addressId, vendorIds }) => {
  if (!addressId || !vendorIds?.length || !(await hasPostgis())) return new Map();
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT v."id"::text AS "vendorId",
           ROUND(ST_Distance(v."pickup_location", a."location"))::int AS "distanceMeters"
    FROM "vendors" v
    CROSS JOIN "user_addresses" a
    WHERE a."id" = ${addressId}::uuid
      AND v."id"::text IN (${Prisma.join(vendorIds.map(String))})
      AND v."pickup_location" IS NOT NULL
      AND a."location" IS NOT NULL
  `);
  return new Map(rows.map((row) => [String(row.vendorId), Number(row.distanceMeters)]));
};
