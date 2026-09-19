import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import ActivityLog from '../../model/ActivityLog.js';

const findById = jest.fn();
const sendMail = jest.fn();

// Isolate the controller from databases, payment providers and real email delivery.
for (const name of ['Approval', 'Reactivation', 'Rejection', 'Suspension']) {
  jest.unstable_mockModule(`../../config/Admin/vendor_mailer/sendVendor${name}Email.js`, () => ({
    [`sendVendor${name}Email`]: jest.fn(),
  }));
}
for (const path of ['vendor/food.model.js', 'menu/MenuItem.js', 'menu/ComboItem.js', 'vendor/VendorOrder.js', 'wallet/Withdrawal.model.js', 'order/Order.js']) {
  jest.unstable_mockModule(`../../model/${path}`, () => ({ default: {} }));
}
jest.unstable_mockModule('../../model/vendor/vendor.model.js', () => ({ default: { findById } }));
jest.unstable_mockModule('../../services/locationService.js', () => ({ resolveVendorLocation: jest.fn() }));
jest.unstable_mockModule('../../services/bank.service.js', () => ({ resolveBankAccount: jest.fn(), createTransferRecipient: jest.fn() }));
jest.unstable_mockModule('../../utils/vendorOpenStatus.js', () => ({ getVendorOpenStatus: jest.fn() }));
jest.unstable_mockModule('../../config/mailer.js', () => ({ sendMail }));

const { sendVendorOnboardingReminder } = await import('../../controller/Admin/vendors_management/vendor.controller.js');
const adminId = new mongoose.Types.ObjectId();
const vendorId = new mongoose.Types.ObjectId();
let vendor;
let res;
let createLog;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-09-19T12:00:00Z'));
  vendor = { _id: vendorId, email: 'test+vendor@example.test', name: 'Test Vendor', storeName: 'Test Kitchen', verified: false, save: jest.fn().mockResolvedValue(undefined) };
  findById.mockReset().mockReturnValue({ select: jest.fn().mockResolvedValue(vendor) });
  sendMail.mockReset().mockResolvedValue({ id: 'test-message' });
  // Keep real Mongoose validation: a missing enum must fail the controller test.
  createLog = jest.spyOn(ActivityLog, 'create').mockImplementation(async (entry) => {
    const log = new ActivityLog(entry);
    await log.validate();
    return log;
  });
  res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const invoke = (query = { vendorId: String(vendorId) }) => sendVendorOnboardingReminder({ query, admin: { _id: adminId } }, res);

test('unverified vendor receives a fresh code and a successful audited response', async () => {
  await invoke();
  expect(res.status).toHaveBeenCalledWith(200);
  expect(vendor.otp).toMatch(/^\d{6}$/);
  expect(vendor.otpExpires.getTime()).toBe(Date.now() + 10 * 60 * 1000);
  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: vendor.email, html: expect.stringContaining(vendor.otp) }));
  expect(sendMail.mock.calls[0][0].html).toContain('/vendors/auth/verify-registration?email=test%2Bvendor%40example.test');
  expect(vendor.save.mock.invocationCallOrder[0]).toBeLessThan(sendMail.mock.invocationCallOrder[0]);
  expect(createLog).toHaveBeenCalledWith(expect.objectContaining({ adminId, targetId: vendorId, action: 'SEND_VENDOR_ONBOARDING_REMINDER', targetType: 'Vendor' }));
  expect(JSON.stringify(res.json.mock.calls)).not.toContain(vendor.otp);
});

test('verified vendor receives a fresh password setup link and a successful audited response', async () => {
  vendor.verified = true;
  await invoke();
  expect(res.status).toHaveBeenCalledWith(200);
  expect(vendor.passwordSetupToken).toMatch(/^[a-f0-9]{64}$/);
  expect(vendor.passwordSetupExpires.getTime()).toBe(Date.now() + 30 * 60 * 1000);
  expect(sendMail.mock.calls[0][0].html).toContain(`/vendors/auth/set-password?email=test%2Bvendor%40example.test&token=${vendor.passwordSetupToken}`);
  expect(createLog).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(res.json.mock.calls)).not.toContain(vendor.passwordSetupToken);
});

test.each([
  ['missing vendor ID', 400],
  ['unknown vendor', 404],
  ['password already set', 400],
])('rejects %s without sending email or writing an audit entry', async (scenario, status) => {
  if (scenario === 'unknown vendor') findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
  if (scenario === 'password already set') vendor.password = 'existing-password-hash';
  await invoke(scenario === 'missing vendor ID' ? {} : undefined);
  expect(res.status).toHaveBeenCalledWith(status);
  expect(sendMail).not.toHaveBeenCalled();
  expect(createLog).not.toHaveBeenCalled();
});

test('mail failure does not report success or record a sent reminder', async () => {
  sendMail.mockRejectedValue(new Error('Test mail service failure'));
  await invoke();
  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  expect(createLog).not.toHaveBeenCalled();
});

test.each(['UPDATE_PENDING_VENDOR', 'UPDATE_VENDOR_PAYOUT_DETAILS'])('validates the related vendor audit action %s', async (action) => {
  await expect(new ActivityLog({ adminId, action, targetType: 'Vendor', targetId: vendorId, details: 'Updated test vendor' }).validate()).resolves.toBeUndefined();
});

test('continues rejecting unknown audit actions', async () => {
  await expect(new ActivityLog({ adminId, action: 'INVALID_ACTION', targetType: 'Vendor', details: 'Invalid test action' }).validate()).rejects.toThrow('is not a valid enum value');
});
