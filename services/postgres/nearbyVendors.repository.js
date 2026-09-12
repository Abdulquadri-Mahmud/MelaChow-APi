import prisma from "../../config/prisma.js";
import { getGlobalDeliveryConfig, quoteVendorDelivery } from "../deliveryPricing.service.js";
import { getPostgisDistancesFromAddress } from "./geography.js";

const idOf = (row) => row?.legacyMongoId || row?.id;
const stateNames = (value) => {
  const raw = String(value || "").trim();
  const short = raw.replace(/\s+state$/i, "").trim();
  return [...new Set([raw, short, short ? `${short} State` : ""].filter(Boolean))];
};

export const nearbyVendorsRepository = {
  async list({ city, state, addressId, userId }) {
    const now = new Date();
    const address = addressId
      ? await prisma.userAddress.findFirst({ where: { OR: [{ id: addressId }, { legacyMongoId: addressId }], ...(userId ? { userId } : {}) } })
      : userId ? await prisma.userAddress.findFirst({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }) : null;
    const targetCity = city || address?.cityName || address?.cityText;
    const targetState = state || address?.stateName || address?.stateText;
    const addressHasCoordinates = Number.isFinite(Number(address?.latitude)) && Number.isFinite(Number(address?.longitude));
    if (!addressHasCoordinates && (!targetCity || !targetState)) return [];
    const locationWhere = addressHasCoordinates
      ? {}
      : {
          city: { is: { name: { equals: String(targetCity).trim(), mode: "insensitive" }, isActive: true } },
          state: { is: { OR: stateNames(targetState).map((name) => ({ name: { equals: name, mode: "insensitive" } })), isActive: true } },
        };
    const vendors = await prisma.vendor.findMany({
      where: {
        verified: true, isApproved: true, isLive: true, active: true,
        suspended: false, deletedAt: null,
        ...locationWhere,
      },
      include: {
        city: true, state: true,
        vendorDeliveryPromos: { where: { isActive: true, OR: [{ startsAt: null }, { startsAt: { lte: now } }], AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] }, orderBy: { createdAt: "desc" } },
      },
      orderBy: [{ rating: "desc" }, { createdAt: "desc" }],
    });
    const globalConfig = await getGlobalDeliveryConfig();
    const postgisDistances = address ? await getPostgisDistancesFromAddress({ addressId: address.id, vendorIds: vendors.map((vendor) => vendor.id) }) : new Map();
    const quotes = address ? await Promise.all(vendors.map((vendor) => quoteVendorDelivery({ vendor, address, checkout: false, globalConfig, estimatedDistanceMeters: postgisDistances.get(vendor.id) }))) : [];
    const quoteByVendor = new Map(quotes.map((quote) => [String(quote.vendorId), quote]));
    return vendors.map((vendor) => {
      const promo = vendor.vendorDeliveryPromos.find((row) => row.maxOrders == null || row.usedOrders < row.maxOrders) || null;
      const quote = quoteByVendor.get(String(idOf(vendor)));
      const address = vendor.address && typeof vendor.address === "object" ? vendor.address : {};
      return {
        _id: idOf(vendor), storeName: vendor.storeName, storeSlug: vendor.storeSlug,
        storeDescription: vendor.storeDescription, logo: vendor.logo,
        address: { ...address, city: vendor.city?.name || vendor.requestedCity || "", state: vendor.state?.name || vendor.requestedState || "" },
        fullAddress: address.street || address.addressLine || "", rating: vendor.rating,
        ratingCount: vendor.ratingCount, cuisineTypes: vendor.cuisineTypes,
        openingHours: vendor.openingHours, deliveryRadiusKm: vendor.deliveryRadiusKm,
        acceptsDelivery: vendor.acceptsDelivery,
        deliveryFee: promo ? 0 : Math.round(Number(quote?.deliveryFeeKobo ?? vendor.platformDeliveryFeeOverride ?? Number(globalConfig.fallbackFlatFeeNaira || 400) * 100) / 100),
        deliveryQuote: quote ? { ...quote, deliveryFee: quote.deliveryFeeKobo / 100, deliveryFeeKobo: undefined } : null,
        distanceKm: quote?.distanceKm ?? null,
        estimatedDeliveryMinutes: quote?.estimatedDurationMinutes ?? null,
        deliverable: quote?.deliverable !== false,
        hasActiveDeliveryPromo: Boolean(promo),
        activeDeliveryPromo: promo ? { promoId: idOf(promo), maxOrders: promo.maxOrders, usedOrders: promo.usedOrders, remainingOrders: promo.maxOrders == null ? null : Math.max(0, promo.maxOrders - promo.usedOrders), startsAt: promo.startsAt, endsAt: promo.endsAt } : null,
        locationStatus: vendor.locationStatus, createdAt: vendor.createdAt,
      };
    }).filter((vendor) => vendor.deliverable).sort((a, b) => {
      if (a.distanceKm == null && b.distanceKm == null) return Number(b.rating || 0) - Number(a.rating || 0);
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm || Number(b.rating || 0) - Number(a.rating || 0);
    });
  },
};
