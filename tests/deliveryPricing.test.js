import { calculateDistanceDeliveryFee, haversineDistanceMeters, quoteVendorDelivery, roundDistanceKm } from "../services/deliveryPricing.service.js";

const config = { fallbackFlatFeeNaira: 400, baseFeeNaira: 400, includedDistanceKm: 1, additionalFeePerKmNaira: 150, roundingMode: "nearest", roundingStepKm: 0.5, minimumFeeNaira: 400, maximumFeeNaira: 5000 };

describe("distance delivery pricing", () => {
  test("uses the base fee within the included kilometre", () => {
    expect(calculateDistanceDeliveryFee(900, config).deliveryFeeKobo).toBe(40000);
  });

  test("rounds normally to 0.5 km and charges only excess distance", () => {
    expect(roundDistanceKm(4.2, "nearest", 0.5)).toBe(4);
    expect(calculateDistanceDeliveryFee(4200, config)).toMatchObject({ billableDistanceKm: 4, deliveryFeeKobo: 85000 });
  });

  test("caps the fee at five thousand naira", () => {
    expect(calculateDistanceDeliveryFee(100000, config).deliveryFeeKobo).toBe(500000);
  });

  test("computes a stable geographic distance", () => {
    expect(haversineDistanceMeters({ lat: 6.0, lng: 3.0 }, { lat: 6.01, lng: 3.0 })).toBeGreaterThan(1100);
  });

  test("uses the global flat fallback but still enforces the delivery radius", async () => {
    const quote = await quoteVendorDelivery({
      vendor: { id: "vendor-1", deliveryManagedBy: "admin", pickupLatitude: 6, pickupLongitude: 3, deliveryRadiusOverrideKm: 1, city: { distanceDeliveryConfig: { enabled: false }, platformDeliveryFee: 10000 } },
      address: { id: "address-1", latitude: 6.02, longitude: 3 },
      globalConfig: { ...config, enabled: false, maximumDistanceKm: 20 },
    });
    expect(quote).toMatchObject({ source: "flat_fallback", deliveryFeeKobo: 40000, deliverable: false, radiusKm: 1 });
  });

  test("uses the global distance rule without requiring a city configuration", async () => {
    const quote = await quoteVendorDelivery({
      vendor: { id: "vendor-2", deliveryManagedBy: "admin", pickupLatitude: 6, pickupLongitude: 3, city: { distanceDeliveryConfig: { ...config, enabled: true }, platformDeliveryFee: 10000 } },
      address: { id: "address-2", latitude: 6.038, longitude: 3 },
      globalConfig: { ...config, enabled: true, maximumDistanceKm: 20 },
    });
    expect(quote.source).toBe("haversine_estimate");
    expect(quote.deliveryFeeKobo).toBeGreaterThan(40000);
    expect(quote.deliverable).toBe(true);
  });
});
