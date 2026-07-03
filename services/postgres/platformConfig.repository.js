import prisma from "../../config/prisma.js";

const defaultPlatformConfig = {
  riderFixedPayout: 600,
  riderAssignmentMode: "manual",
  riderTerminationPenaltyHours: 24,
  commissionEnabled: false,
  commissionRate: 0,
  serviceFeeEnabled: false,
  serviceFeeType: "fixed",
  serviceFeeValue: 0,
  serviceFeeCap: 500,
};

const legacyId = (record) => record?.legacyMongoId || record?.id || null;

const configValue = (config) => ({
  ...defaultPlatformConfig,
  ...(config?.value && typeof config.value === "object" && !Array.isArray(config.value) ? config.value : {}),
});

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
