import crypto from 'crypto';
import mongoose from 'mongoose';
import Vendor from '../model/vendor/vendor.model.js';
import QrScanEvent from '../model/qrScanEvent.model.js';

const FRONTEND_URL = process.env.FRONTEND_URL || process.env.CLIENT_URL || 'https://www.melachow.com';
const IP_HASH_SALT = process.env.IP_HASH_SALT;

// REQUIRED, NO RUNTIME FALLBACK. If this throws, the server fails to start
// at import time — that's intentional. A missing or unstable salt silently
// corrupts the unique-visitor metric (see constraint #7 below for why).
if (!IP_HASH_SALT) {
  throw new Error(
    'IP_HASH_SALT environment variable is required and must be a static value ' +
    'that never changes across restarts. Set it in .env.'
  );
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip + IP_HASH_SALT).digest('hex');
}

export const handleQrScan = async (req, res) => {
  const { vendorId } = req.params;
  const fallbackUrl = `${FRONTEND_URL}/restaurants`;

  if (!mongoose.Types.ObjectId.isValid(vendorId)) {
    return res.redirect(302, fallbackUrl);
  }

  let redirectUrl = fallbackUrl;

  try {
    const vendor = await Vendor.findById(vendorId)
      .select('_id active suspended deletedAt')
      .lean();

    if (vendor && vendor.active && !vendor.suspended && !vendor.deletedAt) {
      redirectUrl = `${FRONTEND_URL}/restaurants/${vendorId}`;
    }
  } catch (err) {
    console.error('⚠️ QR scan vendor lookup failed:', err.message);
  }

  // Respond FIRST. The redirect must never wait on or fail because of logging.
  res.redirect(302, redirectUrl);

  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
    await QrScanEvent.create({
      vendor: vendorId,
      ipHash: hashIp(ip),
      userAgent: (req.headers['user-agent'] || '').slice(0, 300),
    });
  } catch (err) {
    console.error('⚠️ QR scan logging failed:', err.message);
  }
};

export const getQrAnalytics = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { from, to } = req.query;

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ success: false, message: 'Invalid vendor ID' });
    }

    // Authorization:
    // - admin: any vendorId
    // - vendor: ONLY their own vendorId (req.userId === their own _id for vendor tokens)
    // - user (or anything else): not authorized for this endpoint at all
    if (req.userType === 'admin') {
      // allowed
    } else if (req.userType === 'vendor') {
      if (req.userId.toString() !== vendorId) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: cannot access another vendor's analytics",
        });
      }
    } else {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const match = { vendor: new mongoose.Types.ObjectId(vendorId) };
    if (from || to) {
      match.scannedAt = {};
      if (from) match.scannedAt.$gte = new Date(from);
      if (to) match.scannedAt.$lte = new Date(to);
    }

    const result = await QrScanEvent.aggregate([
      { $match: match },
      {
        $facet: {
          totalScans: [{ $count: 'count' }],
          uniqueVisitors: [
            { $group: { _id: '$ipHash' } },
            { $count: 'count' },
          ],
          dailyBreakdown: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$scannedAt' } },
                scans: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    // REQUIRED: $facet returns empty arrays for sub-pipelines with no matching
    // docs (the default state for every vendor right now). Without these
    // defaults, analytics[0].totalScans[0].count throws on undefined and
    // every vendor's first dashboard view returns a 500.
    const facetResult = result[0] || {};
    const totalScans = facetResult.totalScans?.[0]?.count ?? 0;
    const uniqueVisitors = facetResult.uniqueVisitors?.[0]?.count ?? 0;
    const dailyBreakdown = facetResult.dailyBreakdown ?? [];

    res.json({
      success: true,
      data: { totalScans, uniqueVisitors, dailyBreakdown },
    });
  } catch (err) {
    console.error('❌ QR analytics fetch failed:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch QR analytics' });
  }
};
