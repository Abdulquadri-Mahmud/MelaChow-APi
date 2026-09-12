import prisma from "../../../config/prisma.js";
import { DEFAULT_DISTANCE_DELIVERY_CONFIG } from "../../../services/deliveryPricing.service.js";
import { syncVendorPickupPoint } from "../../../services/postgres/geography.js";

const numberFields = ["fallbackFlatFeeNaira", "baseFeeNaira", "includedDistanceKm", "additionalFeePerKmNaira", "roundingStepKm", "minimumFeeNaira", "maximumFeeNaira", "maximumDistanceKm"];
const validate = (input) => {
  const config = { ...DEFAULT_DISTANCE_DELIVERY_CONFIG, ...(input || {}) };
  for (const field of numberFields) if (!Number.isFinite(Number(config[field])) || Number(config[field]) < 0) throw new Error(`${field} must be a non-negative number`);
  if (!["nearest", "up", "down"].includes(config.roundingMode)) throw new Error("roundingMode must be nearest, up, or down");
  if (!config.roundingStepKm) throw new Error("roundingStepKm must be greater than zero");
  if (config.maximumFeeNaira < config.minimumFeeNaira) throw new Error("maximum fee cannot be lower than minimum fee");
  return { ...config, ...Object.fromEntries(numberFields.map(field => [field, Number(config[field])])) };
};

export const getDeliveryPricingConfig = async (_req, res) => {
  try {
    const [platform, vendors, legacyLocationCounts] = await Promise.all([
      prisma.platformConfig.findUnique({ where: { type: "singleton" }, select: { value: true, updatedAt: true } }),
      prisma.vendor.findMany({ where: { deletedAt: null }, select: { id: true, legacyMongoId: true, storeName: true, pickupLatitude: true, pickupLongitude: true, pickupPlaceId: true, pickupFormattedAddress: true, deliveryRadiusOverrideKm: true }, orderBy: { storeName: "asc" } }),
      Promise.all([prisma.state.count(), prisma.city.count()]),
    ]);
    const global = { ...DEFAULT_DISTANCE_DELIVERY_CONFIG, ...(platform?.value?.distanceDeliveryConfig || {}) };
    return res.json({ success: true, data: { global, vendors: vendors.map(vendor => ({ ...vendor, _id: vendor.legacyMongoId || vendor.id })), google: { placesConfigured: Boolean(process.env.GOOGLE_MAPS_SERVER_API_KEY), routesConfigured: Boolean(process.env.GOOGLE_MAPS_SERVER_API_KEY) }, legacyCompatibility: { states: legacyLocationCounts[0], cities: legacyLocationCounts[1], pricingUsesLocationIds: false }, updatedAt: platform?.updatedAt } });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const updateGlobalDeliveryPricing = async (req, res) => {
  try {
    const config = validate(req.body);
    const existing = await prisma.platformConfig.findUnique({ where: { type: "singleton" }, select: { value: true } });
    const value = { ...(existing?.value || {}), distanceDeliveryConfig: config };
    const auditAdmin = req.postgresAdminId ? { lastUpdatedBy: req.postgresAdminId } : {};
    await prisma.platformConfig.upsert({ where: { type: "singleton" }, create: { type: "singleton", value, ...auditAdmin }, update: { value, ...auditAdmin } });
    return res.json({ success: true, data: config, message: "Global delivery pricing updated" });
  } catch (error) { return res.status(400).json({ success: false, message: error.message }); }
};

export const updateVendorDeliveryLocation = async (req, res) => {
  try {
    const { latitude, longitude, placeId, formattedAddress, deliveryRadiusOverrideKm } = req.body || {};
    if (latitude != null && (!Number.isFinite(Number(latitude)) || Number(latitude) < -90 || Number(latitude) > 90)) throw new Error("Invalid latitude");
    if (longitude != null && (!Number.isFinite(Number(longitude)) || Number(longitude) < -180 || Number(longitude) > 180)) throw new Error("Invalid longitude");
    if (deliveryRadiusOverrideKm != null && Number(deliveryRadiusOverrideKm) <= 0) throw new Error("Delivery radius must be greater than zero");
    const existingVendor = await prisma.vendor.findFirst({ where: /^[0-9a-f-]{36}$/i.test(req.params.vendorId) ? { id: req.params.vendorId } : { legacyMongoId: req.params.vendorId }, select: { id: true } });
    if (!existingVendor) throw new Error("Vendor not found");
    const vendor = await prisma.vendor.update({ where: { id: existingVendor.id }, data: { ...(latitude != null ? { pickupLatitude: Number(latitude) } : {}), ...(longitude != null ? { pickupLongitude: Number(longitude) } : {}), ...(placeId !== undefined ? { pickupPlaceId: placeId || null } : {}), ...(formattedAddress !== undefined ? { pickupFormattedAddress: formattedAddress || null } : {}), ...(latitude != null && longitude != null ? { pickupLocationVerifiedAt: new Date(), locationStatus: "approved" } : {}), ...(deliveryRadiusOverrideKm !== undefined ? { deliveryRadiusOverrideKm: deliveryRadiusOverrideKm == null ? null : Number(deliveryRadiusOverrideKm) } : {}) } });
    if (vendor.pickupLatitude != null && vendor.pickupLongitude != null) await syncVendorPickupPoint({ id: vendor.id, latitude: vendor.pickupLatitude, longitude: vendor.pickupLongitude });
    return res.json({ success: true, data: vendor, message: "Vendor delivery location settings updated" });
  } catch (error) { return res.status(400).json({ success: false, message: error.message }); }
};
