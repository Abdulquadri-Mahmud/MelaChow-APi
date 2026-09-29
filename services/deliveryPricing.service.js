import crypto from "crypto";
import prisma from "../config/prisma.js";
import { getPostgisDistancesFromAddress } from "./postgres/geography.js";

export const DEFAULT_DISTANCE_DELIVERY_CONFIG = Object.freeze({
  enabled: true,
  fallbackFlatFeeNaira: 400,
  baseFeeNaira: 400,
  includedDistanceKm: 1,
  additionalFeePerKmNaira: 150,
  roundingMode: "nearest",
  roundingStepKm: 0.5,
  minimumFeeNaira: 400,
  maximumFeeNaira: 5000,
  maximumDistanceKm: 20,
  routeProvider: "google",
  useRoadDistanceAtCheckout: true,
});

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const toKobo = (naira) => Math.round(Number(naira || 0) * 100);
const validCoordinate = (lat, lng) => Number.isFinite(Number(lat)) && Number(lat) >= -90 && Number(lat) <= 90 && Number.isFinite(Number(lng)) && Number(lng) >= -180 && Number(lng) <= 180;
const resolveToken = async (model, token) => {
  if (!token) return null;
  return model.findFirst({ where: uuid.test(String(token)) ? { id: String(token) } : { legacyMongoId: String(token) } });
};

const platformDeliveryConfig = async () => {
  const row = await prisma.platformConfig.findUnique({ where: { type: "singleton" }, select: { value: true } });
  const value = row?.value && typeof row.value === "object" ? row.value : {};
  return { ...DEFAULT_DISTANCE_DELIVERY_CONFIG, ...(value.distanceDeliveryConfig || {}) };
};
export const getGlobalDeliveryConfig = platformDeliveryConfig;

export const roundDistanceKm = (distanceKm, mode = "nearest", step = 0.5) => {
  const safeStep = Number(step) > 0 ? Number(step) : 0.5;
  const units = Number(distanceKm || 0) / safeStep;
  const rounded = mode === "up" ? Math.ceil(units) : mode === "down" ? Math.floor(units) : Math.round(units);
  return Number((rounded * safeStep).toFixed(3));
};

export const calculateDistanceDeliveryFee = (distanceMeters, config) => {
  const distanceKm = Math.max(0, Number(distanceMeters || 0) / 1000);
  const billableDistanceKm = roundDistanceKm(distanceKm, config.roundingMode, config.roundingStepKm);
  const extraKm = Math.max(0, billableDistanceKm - Number(config.includedDistanceKm || 0));
  const rawNaira = Number(config.baseFeeNaira || 0) + extraKm * Number(config.additionalFeePerKmNaira || 0);
  const finalNaira = Math.min(Number(config.maximumFeeNaira || Infinity), Math.max(Number(config.minimumFeeNaira || 0), rawNaira));
  return { distanceKm: Number(distanceKm.toFixed(3)), billableDistanceKm, deliveryFeeKobo: toKobo(finalNaira) };
};

export const haversineDistanceMeters = (a, b) => {
  const rad = (degree) => degree * Math.PI / 180;
  const earth = 6371000;
  const dLat = rad(Number(b.lat) - Number(a.lat));
  const dLng = rad(Number(b.lng) - Number(a.lng));
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(Number(a.lat))) * Math.cos(rad(Number(b.lat))) * Math.sin(dLng / 2) ** 2;
  return Math.round(earth * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
};

const googleRoadRoute = async (origin, destination) => {
  const key = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  if (!key) return null;
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration" },
    body: JSON.stringify({ origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } }, destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } }, travelMode: "DRIVE", routingPreference: "TRAFFIC_UNAWARE" }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Google Routes returned ${response.status}`);
  const route = (await response.json())?.routes?.[0];
  return route ? { distanceMeters: route.distanceMeters, durationSeconds: Number(String(route.duration || "0s").replace("s", "")) || null } : null;
};

const vendorPoint = (vendor) => {
  const address = vendor.address && typeof vendor.address === "object" ? vendor.address : {};
  return { lat: Number(vendor.pickupLatitude ?? address.latitude ?? address.coordinates?.lat), lng: Number(vendor.pickupLongitude ?? address.longitude ?? address.coordinates?.lng) };
};

const flatFallback = (vendor, config) => vendor.platformDeliveryFeeOverride ?? toKobo(config.fallbackFlatFeeNaira);

export const quoteVendorDelivery = async ({ vendor, address, checkout = false, globalConfig: suppliedGlobalConfig, estimatedDistanceMeters = null }) => {
  const vendorIdentity = { vendorId: vendor.legacyMongoId || vendor.id, vendorUuid: vendor.id };
  const origin = vendorPoint(vendor);
  const destination = { lat: Number(address?.latitude), lng: Number(address?.longitude) };
  const coordinatesAvailable = validCoordinate(origin.lat, origin.lng) && validCoordinate(destination.lat, destination.lng);
  const geographicDistanceMeters = coordinatesAvailable
    ? (estimatedDistanceMeters == null ? haversineDistanceMeters(origin, destination) : Number(estimatedDistanceMeters))
    : null;
  const geographicSource = estimatedDistanceMeters == null ? "haversine_estimate" : "postgis_estimate";
  if (vendor.deliveryManagedBy === "vendor") {
    const radiusKm = Number(vendor.deliveryRadiusOverrideKm ?? vendor.deliveryRadiusKm ?? 20);
    const distanceKm = geographicDistanceMeters == null ? null : Number((geographicDistanceMeters / 1000).toFixed(3));
    return { ...vendorIdentity, deliveryFeeKobo: vendor.flatRateDeliveryFee || 0, source: "vendor_flat_rate", distanceSource: distanceKm == null ? null : geographicSource, distanceMeters: geographicDistanceMeters, distanceKm, deliverable: distanceKm == null || distanceKm <= radiusKm, radiusKm, pricingSnapshot: { pricingMode: "vendor_flat_rate", distanceMeters: geographicDistanceMeters, radiusKm } };
  }
  const globalConfig = suppliedGlobalConfig || await platformDeliveryConfig();
  const config = { ...DEFAULT_DISTANCE_DELIVERY_CONFIG, ...globalConfig };
  const radiusKm = Number(vendor.deliveryRadiusOverrideKm ?? config.maximumDistanceKm ?? 20);
  const canCalculate = config.enabled && coordinatesAvailable;
  if (!canCalculate) {
    const distanceKm = geographicDistanceMeters == null ? null : Number((geographicDistanceMeters / 1000).toFixed(3));
    return { ...vendorIdentity, deliveryFeeKobo: flatFallback(vendor, config), source: "flat_fallback", distanceSource: distanceKm == null ? null : geographicSource, distanceMeters: geographicDistanceMeters, distanceKm, deliverable: distanceKm == null || distanceKm <= radiusKm, radiusKm, pricingSnapshot: { pricingMode: "flat_fallback", fallbackFlatFeeKobo: flatFallback(vendor, config), distanceMeters: geographicDistanceMeters, radiusKm } };
  }

  let source = geographicSource;
  let durationSeconds = null;
  let distanceMeters = geographicDistanceMeters;
  if (checkout && config.useRoadDistanceAtCheckout && config.routeProvider === "google") {
    try {
      const route = await googleRoadRoute(origin, destination);
      if (route) { distanceMeters = route.distanceMeters; durationSeconds = route.durationSeconds; source = "google_routes"; }
    } catch (error) {
      console.warn("[delivery-quote] Google route unavailable; using geographic fallback:", error.message);
    }
  }
  const calculated = calculateDistanceDeliveryFee(distanceMeters, config);
  const deliverable = calculated.distanceKm <= radiusKm;
  const quoteId = `dq_${crypto.createHash("sha256").update(`${vendor.id}:${address.id}:${distanceMeters}:${calculated.deliveryFeeKobo}`).digest("hex").slice(0, 20)}`;
  return { ...vendorIdentity, quoteId, deliveryFeeKobo: calculated.deliveryFeeKobo, distanceMeters, distanceKm: calculated.distanceKm, billableDistanceKm: calculated.billableDistanceKm, durationSeconds, estimatedDurationMinutes: durationSeconds ? Math.ceil(durationSeconds / 60) : null, source, deliverable, radiusKm, pricingSnapshot: { pricingMode: "distance", source, distanceMeters, billableDistanceKm: calculated.billableDistanceKm, baseFeeKobo: toKobo(config.baseFeeNaira), includedDistanceKm: config.includedDistanceKm, additionalFeePerKmKobo: toKobo(config.additionalFeePerKmNaira), minimumFeeKobo: toKobo(config.minimumFeeNaira), maximumFeeKobo: toKobo(config.maximumFeeNaira), roundingMode: config.roundingMode, roundingStepKm: config.roundingStepKm } };
};

export const getDeliveryQuotes = async ({ addressId, vendorIds, userId, checkout = false }) => {
  const address = await prisma.userAddress.findFirst({ where: { ...(uuid.test(String(addressId)) ? { id: String(addressId) } : { legacyMongoId: String(addressId) }), ...(userId ? { userId } : {}) } });
  if (!address) throw Object.assign(new Error("Delivery address was not found"), { statusCode: 404 });
  const vendors = await Promise.all((vendorIds || []).map((id) => resolveToken(prisma.vendor, id)));
  const found = vendors.filter(Boolean);
  const hydrated = await prisma.vendor.findMany({ where: { id: { in: found.map(v => v.id) } }, include: { city: true } });
  const globalConfig = await platformDeliveryConfig();
  const postgisDistances = await getPostgisDistancesFromAddress({ addressId: address.id, vendorIds: hydrated.map((vendor) => vendor.id) });
  return Promise.all(hydrated.map((vendor) => quoteVendorDelivery({ vendor, address, checkout, globalConfig, estimatedDistanceMeters: postgisDistances.get(vendor.id) })));
};
