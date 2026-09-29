import prisma from "../../config/prisma.js";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const resolve = async (model, value) => !value ? null : uuid.test(String(value)) ? String(value) : (await model.findUnique({ where: { legacyMongoId: String(value) }, select: { id: true } }))?.id || null;
const moneyIn = value => Math.round(Number(value || 0) * 100);
const shape = row => row ? ({ ...row, _id: row.legacyMongoId || row.id, vendorId: row.vendor?.legacyMongoId || row.vendorId, targetFoodIds: row.targetFoodIds || [], value: row.type === "FIXED" ? row.value / 100 : row.value, minOrderAmount: row.minOrderAmount / 100, maxDiscountAmount: row.maxDiscountAmount == null ? null : row.maxDiscountAmount / 100 }) : null;
const dataFrom = async payload => ({
  code: String(payload.code || "").trim().toUpperCase(), description: payload.description || "",
  type: payload.type, value: payload.type === "FIXED" ? moneyIn(payload.value) : Math.round(Number(payload.value)), scope: payload.scope,
  vendorId: payload.vendorId ? await resolve(prisma.vendor, payload.vendorId) : null,
  targetFoodIds: await Promise.all((payload.targetFoodIds || []).map(id => resolve(prisma.menuItem, id))).then(ids => ids.filter(Boolean)),
  minOrderAmount: moneyIn(payload.minOrderAmount), maxDiscountAmount: payload.maxDiscountAmount == null ? null : moneyIn(payload.maxDiscountAmount),
  startDate: new Date(payload.startDate || Date.now()), endDate: payload.endDate ? new Date(payload.endDate) : null,
  usageLimit: payload.usageLimit == null ? null : Number(payload.usageLimit), userUsageLimit: payload.userUsageLimit == null ? 1 : Number(payload.userUsageLimit),
  fundedBy: payload.fundedBy, isActive: payload.isActive !== false,
});

export const discountRepository = {
  async byCode(code) { return shape(await prisma.discount.findUnique({ where: { code: String(code).toUpperCase() }, include: { vendor: { select: { legacyMongoId: true } } } })); },
  async get(id) { const resolved = await resolve(prisma.discount, id); return resolved ? shape(await prisma.discount.findUnique({ where: { id: resolved }, include: { vendor: { select: { legacyMongoId: true } } } })) : null; },
  async list(vendorId) { const id = vendorId ? await resolve(prisma.vendor, vendorId) : null; const where = vendorId ? { OR: [{ vendorId: id || undefined }, { scope: { in: ["GLOBAL_ORDER", "DELIVERY_FEE"] } }] } : {}; return (await prisma.discount.findMany({ where, include: { vendor: { select: { legacyMongoId: true } } }, orderBy: { createdAt: "desc" } })).map(shape); },
  async create(payload) { return shape(await prisma.discount.create({ data: await dataFrom(payload), include: { vendor: { select: { legacyMongoId: true } } } })); },
  async update(id, payload) { const resolved = await resolve(prisma.discount, id); if (!resolved) return null; return shape(await prisma.discount.update({ where: { id: resolved }, data: await dataFrom(payload), include: { vendor: { select: { legacyMongoId: true } } } })); },
  async setActive(id, isActive) { const resolved = await resolve(prisma.discount, id); return resolved ? shape(await prisma.discount.update({ where: { id: resolved }, data: { isActive } })) : null; },
  async remove(id) { const resolved = await resolve(prisma.discount, id); return resolved ? shape(await prisma.discount.delete({ where: { id: resolved } })) : null; },
  async usageCounts(discountId, { userId, hashedDeviceId, phoneHash }) {
    const id = await resolve(prisma.discount, discountId), resolvedUser = await resolve(prisma.user, userId);
    if (!id) return { total: 0, identity: 0 };
    const [total, identity] = await Promise.all([prisma.discountUsage.count({ where: { discountId: id } }), prisma.discountUsage.count({ where: { discountId: id, OR: [{ userId: resolvedUser || undefined }, { hashedDeviceId: hashedDeviceId || undefined }, { phoneHash: phoneHash || undefined }].filter(x => Object.values(x)[0]) } })]);
    return { total, identity };
  },
  async recordUsage(discountId, usage) {
    const id = await resolve(prisma.discount, discountId), userId = await resolve(prisma.user, usage.userId), orderId = await resolve(prisma.order, usage.orderId);
    if (!id) return { modifiedCount: 0 };
    try { await prisma.$transaction(async tx => { const d = await tx.discount.findUnique({ where: { id } }); if (!d || (d.usageLimit != null && d.usageCount >= d.usageLimit)) throw new Error("LIMIT"); await tx.discount.update({ where: { id }, data: { usageCount: { increment: 1 } } }); await tx.discountUsage.create({ data: { discountId: id, userId, orderId, hashedDeviceId: usage.hashedDeviceId || null, phoneHash: usage.phoneHash || null } }); }, { isolationLevel: "Serializable" }); return { modifiedCount: 1 }; } catch (error) { if (error.message === "LIMIT" || error.code === "P2034") return { modifiedCount: 0 }; throw error; }
  },
};
