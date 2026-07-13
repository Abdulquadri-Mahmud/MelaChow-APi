import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import axios from 'axios';
import Order from '../../model/order/Order.js';
import Wallet from '../../model/wallet/wallet.mode.js';
import VendorOrder from '../../model/vendor/VendorOrder.js';
import { updateOrderAfterPayment } from '../../controller/order/createOrderV2.controller.js';
import {
    createTestUser,
    createTestVendor,
    createTestAdmin,
    createTestWallet,
    createTestOrder,
} from '../helpers/factories.js';

describe('Payment Verification & Escrow', () => {
    let user, vendor, admin, order, adminWallet;

    beforeEach(async () => {
        user = await createTestUser();
        vendor = await createTestVendor();
        admin = await createTestAdmin();
        adminWallet = await createTestWallet(admin._id, 'Admin', 0);

        order = await createTestOrder(user._id, vendor._id, {
            paymentStatus: 'pending',
            orderStatus: 'pending',
            paymentReference: `PSK_TEST_${Date.now()}`,
        });
    });

    it('should create VendorOrder and credit admin escrow on payment verification', async () => {
        const updatedOrder = await updateOrderAfterPayment(order._id, order.paymentReference);

        // Payment is complete, but the restaurant has not accepted yet.
        expect(updatedOrder.paymentStatus).toBe('paid');
        expect(updatedOrder.orderStatus).toBe('pending');

        // VendorOrder created
        const vendorOrder = await VendorOrder.findOne({ userOrderId: order._id });
        expect(vendorOrder).not.toBeNull();
        expect(vendorOrder.orderStatus).toBe('pending');
        expect(vendorOrder.escrowAmount).toBeGreaterThan(0);
        expect(vendorOrder.escrowReleased).toBe(false);

        // Admin wallet credited
        const updatedAdminWallet = await Wallet.findOne({ ownerModel: 'Admin' });
        expect(updatedAdminWallet.balance).toBeGreaterThan(0);

        // Transactions are tagged correctly
        const escrowTx = updatedAdminWallet.transactions.find(t => t.transactionType === 'escrow_hold');
        const commissionTx = updatedAdminWallet.transactions.find(t => t.transactionType === 'commission');
        expect(escrowTx).toBeDefined();
        expect(commissionTx).toBeDefined();
    });

    it('should be idempotent — calling twice does not double-credit admin wallet', async () => {
        await updateOrderAfterPayment(order._id, order.paymentReference);
        await updateOrderAfterPayment(order._id, order.paymentReference);

        const vendorOrders = await VendorOrder.find({ userOrderId: order._id });
        expect(vendorOrders.length).toBe(1); // Only one VendorOrder created

        const adminWalletAfter = await Wallet.findOne({ ownerModel: 'Admin' });
        const escrowTransactions = adminWalletAfter.transactions.filter(
            t => t.transactionType === 'escrow_hold'
        );
        expect(escrowTransactions.length).toBe(1); // Commission credited once only
    });

    it('should not process already-paid order', async () => {
        await Order.findByIdAndUpdate(order._id, { paymentStatus: 'paid', orderStatus: 'accepted' });

        const result = await updateOrderAfterPayment(order._id, order.paymentReference);
        expect(result.paymentStatus).toBe('paid');

        // No VendorOrder should be created since order was already paid
        const vendorOrders = await VendorOrder.find({ userOrderId: order._id });
        expect(vendorOrders.length).toBe(0);
    });
});
