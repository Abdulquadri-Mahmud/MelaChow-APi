import { PUBLIC_VENDOR_FILTER, assertVendorAcceptingOrders, isVendorAcceptingOrders } from "../../utils/vendorAvailability.js";

describe("vendor availability", () => {
  const liveVendor = { storeName: "Test Kitchen", verified: true, isApproved: true, isLive: true, active: true, suspended: false, deletedAt: null };

  test("public discovery requires every publication and account guard", () => {
    expect(PUBLIC_VENDOR_FILTER).toEqual({ verified: true, isApproved: true, isLive: true, active: true, suspended: false, deletedAt: null });
  });

  test("accepts an eligible live vendor", () => {
    expect(isVendorAcceptingOrders(liveVendor)).toBe(true);
    expect(() => assertVendorAcceptingOrders(liveVendor)).not.toThrow();
  });

  test.each(["verified", "isApproved", "isLive", "active"])("rejects a vendor when %s is false", (field) => {
    const vendor = { ...liveVendor, [field]: false };
    expect(isVendorAcceptingOrders(vendor)).toBe(false);
    expect(() => assertVendorAcceptingOrders(vendor)).toThrow("Test Kitchen is not currently accepting orders");
  });

  test("rejects suspended and deleted vendors", () => {
    expect(isVendorAcceptingOrders({ ...liveVendor, suspended: true })).toBe(false);
    expect(isVendorAcceptingOrders({ ...liveVendor, deletedAt: new Date() })).toBe(false);
  });
});
