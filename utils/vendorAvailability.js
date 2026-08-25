export const PUBLIC_VENDOR_FILTER = Object.freeze({
  verified: true,
  isApproved: true,
  isLive: true,
  active: true,
  suspended: false,
  deletedAt: null,
});

export const isVendorAcceptingOrders = (vendor) => Boolean(
  vendor?.verified && vendor?.isApproved && vendor?.isLive && vendor?.active &&
  !vendor?.suspended && !vendor?.deletedAt
);

export const assertVendorAcceptingOrders = (vendor) => {
  if (!isVendorAcceptingOrders(vendor)) {
    throw new Error(`${vendor?.storeName || "This restaurant"} is not currently accepting orders`);
  }
};
