import { describe, it, expect, beforeEach } from '@jest/globals';
import Order from '../../model/order/Order.js';
import Wallet from '../../model/wallet/wallet.mode.js';
import Refund from '../../model/refund.model.js';
import { refundOrderToWallet } from '../../services/refund.service.js';
import {
    createTestUser,
    createTestVendor,
    createTestAdmin,
    createTestWallet,
    createTestOrder,
} from '../helpers/factories.js';

describe('Refund System', () => {
    let user, vendor, admin, order, adminWallet, userWallet;

    beforeEach(async () => {
        user = await createTestUser();
        vendor = await createTestVendor();
        admin = await createTestAdmin();

        // Admin wallet must have enough balance to cover refund
        adminWallet = await createTestWallet(admin._id, 'Admin', 10000);
        userWallet = await createTestWallet(user._id, 'User', 0);

        order = await createTestOrder(user._id, vendor._id, {
            paymentStatus: 'paid',
            orderStatus: 'pending',
            subtotal: 2500,
            total: 3000,
        });
    });

    it('should give full refund when order was pending at cancellation', async () => {
        const refund = await refundOrderToWallet(order._id, 'auto_cancel');

        expect(refund).not.toBeNull();
        expect(refund.amount).toBe(3000); // Full refund
        expect(refund.commissionRetained).toBe(0);
        expect(refund.reason).toBe('auto_cancel');
        expect(refund.status).toBe('completed');

        // Customer wallet credited
        const updatedUserWallet = await Wallet.findOne({ ownerId: user._id, ownerModel: 'User' });
        expect(updatedUserWallet.balance).toBe(3000);

        // Admin wallet debited
        const updatedAdminWallet = await Wallet.findOne({ ownerModel: 'Admin' });
        expect(updatedAdminWallet.balance).toBe(7000); // 10000 - 3000

        // Refund transaction tagged correctly
        const refundTx = updatedAdminWallet.transactions.find(t => t.transactionType === 'refund');
        expect(refundTx).toBeDefined();
        expect(refundTx.amount).toBe(3000);
    });

    it('should retain 10% commission when order was accepted at cancellation', async () => {
        await Order.findByIdAndUpdate(order._id, { orderStatus: 'accepted' });

        const refund = await refundOrderToWallet(order._id, 'vendor_cancel');

        const expectedCommission = 2500 * 0.10; // 250
        const expectedRefund = 3000 - expectedCommission; // 2750

        expect(refund.commissionRetained).toBe(expectedCommission);
        expect(refund.amount).toBe(expectedRefund);

        const updatedUserWallet = await Wallet.findOne({ ownerId: user._id, ownerModel: 'User' });
        expect(updatedUserWallet.balance).toBe(expectedRefund);
    });

    it('should be idempotent — calling twice does not double-refund', async () => {
        await refundOrderToWallet(order._id, 'auto_cancel');
        const secondResult = await refundOrderToWallet(order._id, 'auto_cancel');

        // Second call returns the existing refund
        expect(secondResult.reason).toBe('auto_cancel');

        // User wallet still has correct balance — not doubled
        const userWalletAfter = await Wallet.findOne({ ownerId: user._id, ownerModel: 'User' });
        expect(userWalletAfter.balance).toBe(3000);

        // Only one Refund document exists
        const refunds = await Refund.find({ orderId: order._id });
        expect(refunds.length).toBe(1);
    });

    it('should not refund unpaid orders', async () => {
        await Order.findByIdAndUpdate(order._id, { paymentStatus: 'pending' });

        const result = await refundOrderToWallet(order._id, 'auto_cancel');
        expect(result).toBeNull();

        // User wallet unchanged
        const userWalletAfter = await Wallet.findOne({ ownerId: user._id, ownerModel: 'User' });
        expect(userWalletAfter.balance).toBe(0);
    });

    it('should update order paymentStatus to refunded', async () => {
        await refundOrderToWallet(order._id, 'vendor_cancel');

        const updatedOrder = await Order.findById(order._id);
        expect(updatedOrder.paymentStatus).toBe('refunded');
        expect(updatedOrder.orderStatus).toBe('cancelled');
    });
});
