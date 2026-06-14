import { getPlatformConfig } from '../../services/platformConfig.service.js';
import { usePostgresPlatformConfigReads } from '../../services/postgres/compat.js';
import { platformConfigRepository } from '../../services/postgres/platformConfig.repository.js';

/**
 * GET /api/public/platform-config
 * Public — no auth required.
 * Exposes ONLY customer-facing fee settings.
 * Never exposes rider payout, commission, or audit fields.
 */
export const getPublicPlatformConfig = async (req, res) => {
  try {
    if (usePostgresPlatformConfigReads()) {
      const response = await platformConfigRepository.getPublicConfig();
      return res.json(response);
    }

    const config = await getPlatformConfig();
    return res.json({
      success: true,
      data: {
        serviceFeeEnabled: config.serviceFeeEnabled,
        serviceFeeType:    config.serviceFeeType,
        serviceFeeValue:   config.serviceFeeValue,
        serviceFeeCap:     config.serviceFeeCap,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
