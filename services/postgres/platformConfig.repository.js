import prisma from "../../config/prisma.js";

const defaultPlatformConfig = {
  riderPayoutType: "flat",
  riderPayoutValue: 600,
  riderFixedPayout: 600,
  riderMinPayoutBalance: 500,
  riderAssignmentMode: "manual",
  riderTerminationPenaltyHours: 24,
  riderPayoutHour: 10,
  commissionEnabled: false,
  commissionRate: 0,
  serviceFeeEnabled: false,
  serviceFeeType: "fixed",
  serviceFeeValue: 0,
  serviceFeeCap: 500,
  paystackFeeBearer: "customer",
};

const legacyId = (record) => record?.legacyMongoId || record?.id || null;

const configValue = (config) => {
  const stored = config?.value && typeof config.value === "object" && !Array.isArray(config.value) ? config.value : {};
  return {
    ...defaultPlatformConfig,
    ...stored,
    riderPayoutValue: stored.riderPayoutValue ?? stored.riderFixedPayout ?? defaultPlatformConfig.riderPayoutValue,
  };
};

const adminShape = (config) => {
  if (!config) {
    return {
      ...defaultPlatformConfig,
      lastUpdatedBy: null,
      updatedAt: null,
      _isDefault: true,
    };
  }

  const value = configValue(config);
  delete value.riderPayoutHour;

  return {
    _id: legacyId(config),
    type: config.type,
    ...value,
    lastUpdatedBy: config.lastUpdatedByAdmin
      ? {
          _id: legacyId(config.lastUpdatedByAdmin),
          email: config.lastUpdatedByAdmin.email,
          name: config.lastUpdatedByAdmin.name,
        }
      : null,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    __v: 0,
  };
};

const publicShape = (config) => {
  const value = configValue(config);
  return {
    serviceFeeEnabled: value.serviceFeeEnabled,
    serviceFeeType: value.serviceFeeType,
    serviceFeeValue: value.serviceFeeValue,
    serviceFeeCap: value.serviceFeeCap,
  };
};

const getSingleton = () =>
  prisma.platformConfig.findUnique({
    where: { type: "singleton" },
    include: {
      lastUpdatedByAdmin: {
        select: {
          id: true,
          legacyMongoId: true,
          email: true,
          name: true,
        },
      },
    },
  });

export const platformConfigRepository = {
  async getRuntimeConfig() {
    return configValue(await getSingleton());
  },
  async updateAdminConfig(adminToken, changes) {
    const existing = await getSingleton();
    const admin = adminToken ? await prisma.admin.findFirst({ where: { OR: [{ id: /^[0-9a-f-]{36}$/i.test(String(adminToken)) ? String(adminToken) : undefined }, { legacyMongoId: String(adminToken) }] }, select: { id: true } }) : null;
    const value = { ...configValue(existing), ...changes };
    const config = await prisma.platformConfig.upsert({ where: { type: "singleton" }, create: { type: "singleton", value, lastUpdatedBy: admin?.id || null }, update: { value, lastUpdatedBy: admin?.id || null }, include: { lastUpdatedByAdmin: { select: { id: true, legacyMongoId: true, email: true, name: true } } } });
    return { success: true, message: "Platform configuration updated. Changes take effect on the next order.", data: adminShape(config) };
  },
  async getAdminConfig() {
    const config = await getSingleton();
    return {
      success: true,
      data: adminShape(config),
    };
  },

  async getPublicConfig() {
    const config = await getSingleton();
    return {
      success: true,
      data: publicShape(config),
    };
  },
};
