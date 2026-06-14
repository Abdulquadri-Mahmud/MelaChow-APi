import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import Vendor from '../model/vendor/vendor.model.js';
import QrScanEvent from '../model/qrScanEvent.model.js';
import { handleQrScan, getQrAnalytics } from '../controller/qr.controller.js';

// Setup Express mock helpers
const makeReq = (overrides = {}) => ({
  params: {},
  query: {},
  headers: {
    'x-forwarded-for': '192.168.1.1',
    'user-agent': 'Test Agent',
  },
  ip: '192.168.1.1',
  ...overrides,
});

const makeRes = () => {
  const res = {};
  res.redirect = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Set up stable salt for tests
const originalSalt = process.env.IP_HASH_SALT;
beforeAll(() => {
  process.env.IP_HASH_SALT = 'test_salt_for_qr_scans';
  process.env.FRONTEND_URL = 'https://melachow.com';
});

afterAll(() => {
  process.env.IP_HASH_SALT = originalSalt;
});

describe('QR Controller', () => {
  let activeVendor, suspendedVendor, softDeletedVendor;

  beforeEach(async () => {
    // Clear collections (MongoMemoryServer is running via setup.js)
    await Vendor.deleteMany({});
    await QrScanEvent.deleteMany({});

    activeVendor = await Vendor.create({
      name: 'Active Owner',
      email: 'active@melachow.com',
      phone: '1234567890',
      storeName: 'Active Buka',
      cuisineTypes: ['Local'],
      active: true,
      suspended: false,
      deletedAt: null,
    });

    suspendedVendor = await Vendor.create({
      name: 'Suspended Owner',
      email: 'suspended@melachow.com',
      phone: '1234567891',
      storeName: 'Suspended Buka',
      cuisineTypes: ['Local'],
      active: true,
      suspended: true,
      deletedAt: null,
    });

    softDeletedVendor = await Vendor.create({
      name: 'Deleted Owner',
      email: 'deleted@melachow.com',
      phone: '1234567892',
      storeName: 'Deleted Buka',
      cuisineTypes: ['Local'],
      active: true,
      suspended: false,
      deletedAt: new Date(),
    });
  });

  describe('handleQrScan', () => {
    it('redirects to the specific vendor page if vendor is fully active', async () => {
      const req = makeReq({ params: { vendorId: activeVendor._id.toString() } });
      const res = makeRes();

      await handleQrScan(req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        302,
        `https://melachow.com/restaurants/${activeVendor._id.toString()}`
      );

      // Wait briefly for the fire-and-forget log write to complete
      await new Promise(r => setTimeout(r, 50));

      const logs = await QrScanEvent.find({ vendor: activeVendor._id });
      expect(logs.length).toBe(1);
      expect(logs[0].userAgent).toBe('Test Agent');
      // The IP must be hashed
      expect(logs[0].ipHash).not.toBe('192.168.1.1');
    });

    it('redirects to fallback browse page for suspended vendor', async () => {
      const req = makeReq({ params: { vendorId: suspendedVendor._id.toString() } });
      const res = makeRes();

      await handleQrScan(req, res);

      expect(res.redirect).toHaveBeenCalledWith(302, 'https://melachow.com/restaurants');

      // Even if fallback, the scan might be logged since it hit the endpoint
      await new Promise(r => setTimeout(r, 50));
      const logs = await QrScanEvent.find({ vendor: suspendedVendor._id });
      expect(logs.length).toBe(1);
    });

    it('redirects to fallback browse page for soft-deleted vendor', async () => {
      const req = makeReq({ params: { vendorId: softDeletedVendor._id.toString() } });
      const res = makeRes();

      await handleQrScan(req, res);

      expect(res.redirect).toHaveBeenCalledWith(302, 'https://melachow.com/restaurants');
    });

    it('redirects to fallback browse page for malformed vendor ID without logging', async () => {
      const req = makeReq({ params: { vendorId: 'invalid123' } });
      const res = makeRes();

      await handleQrScan(req, res);

      expect(res.redirect).toHaveBeenCalledWith(302, 'https://melachow.com/restaurants');
      await new Promise(r => setTimeout(r, 50));
      const allLogs = await QrScanEvent.countDocuments();
      expect(allLogs).toBe(0);
    });
  });

  describe('getQrAnalytics', () => {
    let testVendor;

    beforeEach(async () => {
      testVendor = activeVendor;

      // Seed 3 scans for testVendor. 2 from same IP, 1 from different.
      // And 1 scan for another vendor.
      await QrScanEvent.insertMany([
        { vendor: testVendor._id, ipHash: 'hash1', scannedAt: new Date('2024-01-01T12:00:00Z') },
        { vendor: testVendor._id, ipHash: 'hash1', scannedAt: new Date('2024-01-01T14:00:00Z') }, // same day, same visitor
        { vendor: testVendor._id, ipHash: 'hash2', scannedAt: new Date('2024-01-02T10:00:00Z') }, // diff day, diff visitor
        { vendor: suspendedVendor._id, ipHash: 'hash3', scannedAt: new Date('2024-01-01T12:00:00Z') },
      ]);
    });

    it('returns 403 when a user (non-vendor/non-admin) tries to access', async () => {
      const req = makeReq({
        params: { vendorId: testVendor._id.toString() },
        userType: 'user', // standard user
      });
      const res = makeRes();

      await getQrAnalytics(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 403 when vendor tries to access another vendor\'s analytics', async () => {
      const req = makeReq({
        params: { vendorId: testVendor._id.toString() },
        userType: 'vendor',
        userId: suspendedVendor._id.toString(), // Wrong vendor
      });
      const res = makeRes();

      await getQrAnalytics(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('allows vendor to access their own analytics and calculates correctly', async () => {
      const req = makeReq({
        params: { vendorId: testVendor._id.toString() },
        userType: 'vendor',
        userId: testVendor._id.toString(), // Correct vendor
      });
      const res = makeRes();

      await getQrAnalytics(req, res);

      expect(res.json).toHaveBeenCalled();
      const responseBody = res.json.mock.calls[0][0];
      
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.totalScans).toBe(3); // 3 scans total
      expect(responseBody.data.uniqueVisitors).toBe(2); // hash1 and hash2

      // Verify daily breakdown structure and sorting
      expect(responseBody.data.dailyBreakdown.length).toBe(2);
      expect(responseBody.data.dailyBreakdown[0]._id).toBe('2024-01-01');
      expect(responseBody.data.dailyBreakdown[0].scans).toBe(2);
      expect(responseBody.data.dailyBreakdown[1]._id).toBe('2024-01-02');
      expect(responseBody.data.dailyBreakdown[1].scans).toBe(1);
    });

    it('allows admin to access any vendor\'s analytics', async () => {
      const req = makeReq({
        params: { vendorId: suspendedVendor._id.toString() },
        userType: 'admin',
      });
      const res = makeRes();

      await getQrAnalytics(req, res);

      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.totalScans).toBe(1);
    });

    it('handles vendors with zero scans gracefully (no 500 error)', async () => {
      const emptyVendor = softDeletedVendor; // Has 0 scans
      const req = makeReq({
        params: { vendorId: emptyVendor._id.toString() },
        userType: 'admin',
      });
      const res = makeRes();

      await getQrAnalytics(req, res);

      const responseBody = res.json.mock.calls[0][0];
      expect(responseBody.success).toBe(true);
      expect(responseBody.data.totalScans).toBe(0);
      expect(responseBody.data.uniqueVisitors).toBe(0);
      expect(responseBody.data.dailyBreakdown).toEqual([]);
    });
  });
});
