import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { enrichTransactionWithLocalStatus } from '../../services/paystackTransactions.service.js';

describe('Paystack Transaction Oversight Cross-Referencing & Redaction', () => {

    it('should classify transaction as MATCHED when Paystack is success and local order is paid', () => {
        const paystackTx = {
            id: 9876543210,
            reference: 'PSK_REF_MATCHED_123',
            amount: 154800,
            status: 'success',
            authorization: {
                authorization_code: 'AUTH_123',
                bin: '408408',
                last4: '1234',
                signature: 'SIG_SECRET_DONT_EXPOSE',
            },
            customer: {
                id: 111,
                email: 'customer@example.com',
                first_name: 'John',
                last_name: 'Doe',
            },
            ip_address: '192.168.1.1',
        };

        const localOrder = {
            _id: new mongoose.Types.ObjectId(),
            orderId: 'ORD-123',
            total: 1548,
            paymentStatus: 'paid',
            status: 'paid',
            createdAt: new Date(),
        };

        const enriched = enrichTransactionWithLocalStatus(paystackTx, localOrder, null);

        expect(enriched.localStatus).toBe('MATCHED');
        expect(enriched.mismatchReason).toBeNull();
        expect(enriched.ip_address).toBeUndefined(); // IP redacted
        expect(enriched.authorization.signature).toBeUndefined(); // Signature redacted
        expect(enriched.authorization.last4).toBe('1234');
        expect(enriched.customer.email).toBe('customer@example.com');
        expect(enriched.localOrder.orderId).toBe('ORD-123');
    });

    it('should classify transaction as MISMATCH_UNPAID_LOCAL when Paystack is success but local order is pending', () => {
        const paystackTx = {
            id: 9876543211,
            reference: 'PSK_REF_UNPAID_456',
            amount: 250000,
            status: 'success',
        };

        const localOrder = {
            _id: new mongoose.Types.ObjectId(),
            orderId: 'ORD-456',
            total: 2500,
            paymentStatus: 'pending',
            status: 'pending',
            createdAt: new Date(),
        };

        const enriched = enrichTransactionWithLocalStatus(paystackTx, localOrder, null);

        expect(enriched.localStatus).toBe('MISMATCH_UNPAID_LOCAL');
        expect(enriched.mismatchReason).toContain("local order ORD-456 status is 'pending'");
    });

    it('should classify transaction as NOT_FOUND_LOCAL when Paystack is success but no local record exists', () => {
        const paystackTx = {
            id: 9876543212,
            reference: 'PSK_REF_GHOST_789',
            amount: 500000,
            status: 'success',
        };

        const enriched = enrichTransactionWithLocalStatus(paystackTx, null, null);

        expect(enriched.localStatus).toBe('NOT_FOUND_LOCAL');
        expect(enriched.mismatchReason).toContain("no local Order or PaymentAttempt record was found for reference 'PSK_REF_GHOST_789'");
        expect(enriched.localOrder).toBeNull();
    });
});
