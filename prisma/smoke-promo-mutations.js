import "dotenv/config";
import prisma from "../config/prisma.js";
import { promoRepository } from "../services/postgres/promo.repository.js";

const ids = { platform: null, vendor: null };
let vendorSnapshot;
let activePlatformIds = [], activeVendorIds = [];
try {
  activePlatformIds = (await prisma.freeDeliveryPromo.findMany({ where: { isActive: true }, select: { id: true } })).map(row => row.id);
  await prisma.freeDeliveryPromo.updateMany({ where: { isActive: true }, data: { isActive: false } });
  const platform = await promoRepository.createPlatform({ name: "Smoke promo", totalSlots: 3, startsAt: new Date(), endsAt: new Date(Date.now() + 86400000) });
  if (!platform.promo) throw new Error(`Platform create failed: ${platform.error}`);
  ids.platform = platform.promo.id;
  const updated = await promoRepository.updatePlatform(ids.platform, { totalSlots: 4, name: "Updated smoke" });
  if (updated.promo.totalSlots !== 4 || updated.promo.name !== "Updated smoke") throw new Error("Platform update failed");
  await promoRepository.setPlatformActive(ids.platform, false);
  const reactivated = await promoRepository.setPlatformActive(ids.platform, true, true);
  if (!reactivated.promo.isActive || reactivated.promo.usedSlots !== 0) throw new Error("Platform activation failed");

  const vendor = await prisma.vendor.findFirst({ select: { id: true, legacyMongoId: true, hasActiveDeliveryPromo: true } });
  if (!vendor) throw new Error("No vendor available");
  vendorSnapshot = { id: vendor.id, hasActiveDeliveryPromo: vendor.hasActiveDeliveryPromo };
  activeVendorIds = (await prisma.vendorDeliveryPromo.findMany({ where: { vendorId: vendor.id, isActive: true }, select: { id: true } })).map(row => row.id);
  await prisma.vendorDeliveryPromo.updateMany({ where: { vendorId: vendor.id, isActive: true }, data: { isActive: false } });
  const createdVendor = await promoRepository.createVendor({ vendorId: vendor.legacyMongoId || vendor.id, startsAt: new Date(), endsAt: new Date(Date.now() + 86400000), maxOrders: 2, adminNote: "smoke" });
  if (!createdVendor.promo) throw new Error(`Vendor promo create failed: ${createdVendor.error}`);
  ids.vendor = createdVendor.promo.id;
  const inactive = await promoRepository.deactivateVendor(ids.vendor);
  if (inactive.isActive) throw new Error("Vendor promo deactivate failed");
  console.log(JSON.stringify({ ok: true, platformCrud: true, singleActiveGuard: true, vendorCreateDeactivate: true }, null, 2));
} catch (error) { console.error(JSON.stringify({ ok: false, error: error.message }, null, 2)); process.exitCode = 1; }
finally {
  if (ids.vendor) await prisma.vendorDeliveryPromo.delete({ where: { id: ids.vendor } }).catch(() => {});
  if (vendorSnapshot) await prisma.vendor.update({ where: { id: vendorSnapshot.id }, data: { hasActiveDeliveryPromo: vendorSnapshot.hasActiveDeliveryPromo } }).catch(() => {});
  if (ids.platform) await prisma.freeDeliveryPromo.delete({ where: { id: ids.platform } }).catch(() => {});
  if (activePlatformIds.length) await prisma.freeDeliveryPromo.updateMany({ where: { id: { in: activePlatformIds } }, data: { isActive: true } }).catch(() => {});
  if (activeVendorIds.length) await prisma.vendorDeliveryPromo.updateMany({ where: { id: { in: activeVendorIds } }, data: { isActive: true } }).catch(() => {});
  await prisma.$disconnect();
}
