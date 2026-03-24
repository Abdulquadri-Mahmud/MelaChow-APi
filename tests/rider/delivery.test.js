import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Order from '../../model/order/Order.js';
import Wallet from '../../model/wallet/wallet.mode.js';
import { sendDeliveryOTP, verifyDeliveryOTP } from '../../services/termii.service.js';
import {
    createTestUser,
    createTestVendor,
    createTestAdmin,
    createTestWallet,
    createTestOrder,
    createTestRider,
} from '../helpers/factories.js';

// Force dev mode for all delivery tests
// This ensures OTP bypass (123456) is active
process.env.NODE_ENV = 'test';

describe('OTP Delivery Confirmation', () => {
    let user, vendor, admin, order, rider;

    beforeEach(async () => {
        user = await createTestUser();
        vendor = await createTestVendor();
        admin = await createTestAdmin();
        await createTestWallet(admin._id, 'Admin', 10000);
        await createTestWallet(user._id, 'User', 0);

        rider = await createTestRider(vendor._id);
        await createTestWallet(rider._id, 'Rider', 0);

        order = await createTestOrder(user._id, vendor._id, {
            paymentStatus: 'paid',
            orderStatus: 'out_for_delivery',
            riderId: rider._id,
        });
    });

    it('should send OTP and return dev method in non-production', async () => {
        const result = await sendDeliveryOTP(
            order._id.toString(),
            '08012345678',
            user._id.toString()
        );

        expect(result.success).toBe(true);
        expect(result.method).toBe('dev');
    });

    it('should verify correct OTP in dev mode', async () => {
        await sendDeliveryOTP(order._id.toString(), '08012345678', user._id.toString());

        const { verified } = await verifyDeliveryOTP(order._id.toString(), '123456');
        expect(verified).toBe(true);
    });

    it('should reject incorrect OTP', async () => {
        await sendDeliveryOTP(order._id.toString(), '08012345678', user._id.toString());

        const { verified } = await verifyDeliveryOTP(order._id.toString(), '999999');
        expect(verified).toBe(false);
    });

    it('should throw if OTP not requested first', async () => {
        await expect(
            verifyDeliveryOTP(order._id.toString(), '123456')
        ).rejects.toThrow('OTP expired or not found');
    });

    it('should mark order delivered after OTP verification', async () => {
        // Set up rider properly
        await Order.findByIdAndUpdate(order._id, { riderId: rider._id });
        rider.status = 'on_delivery';
        rider.currentOrderId = order._id;
        await rider.save();

        await sendDeliveryOTP(order._id.toString(), '08012345678', user._id.toString());
        await verifyDeliveryOTP(order._id.toString(), '123456');

        const { markDelivered } = await import('../../services/rider.service.js');
        const deliveredOrder = await markDelivered(order._id.toString(), rider._id.toString());

        expect(deliveredOrder.orderStatus).toBe('delivered');

        // Rider freed up
        const updatedRider = await (await import('../../model/rider.model.js')).default.findById(rider._id);
        expect(updatedRider.status).toBe('available');
        expect(updatedRider.currentOrderId).toBeNull();
    });
});
