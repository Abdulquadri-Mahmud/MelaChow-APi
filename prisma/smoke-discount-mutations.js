import "dotenv/config";
import prisma from "../config/prisma.js";
import { discountRepository } from "../services/postgres/discount.repository.js";

let discountId;
try {
  const user = await prisma.user.findFirst({ select: { id: true, legacyMongoId: true } });
  if (!user) throw new Error("No user available for discount smoke test");
  const code = `PGSMOKE${Date.now()}`;
  const created = await discountRepository.create({ code, description: "Postgres smoke", type: "FIXED", value: 100, scope: "GLOBAL_ORDER", minOrderAmount: 500, usageLimit: 1, userUsageLimit: 1, fundedBy: "PLATFORM", isActive: true });
  discountId = created.id;
  if (created.value !== 100 || created.minOrderAmount !== 500) throw new Error("Money adapter conversion failed");
  const updated = await discountRepository.update(created.id, { ...created, description: "Updated smoke", value: 120 });
  if (updated.description !== "Updated smoke" || updated.value !== 120) throw new Error("Discount update failed");
  const first = await discountRepository.recordUsage(created.id, { userId: user.legacyMongoId || user.id, hashedDeviceId: `smoke-${code}` });
  const second = await discountRepository.recordUsage(created.id, { userId: user.legacyMongoId || user.id, hashedDeviceId: `smoke-${code}` });
  if (first.modifiedCount !== 1 || second.modifiedCount !== 0) throw new Error("Atomic usage limit failed");
  const disabled = await discountRepository.setActive(created.id, false);
  if (disabled.isActive) throw new Error("Discount activation mutation failed");
  console.log(JSON.stringify({ ok: true, crud: true, moneyBoundary: true, usageLimitAtomic: true }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
} finally {
  if (discountId) await prisma.discount.delete({ where: { id: discountId } }).catch(() => {});
  await prisma.$disconnect();
}
