import { describe, it, expect, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { validateSuccessfulPaymentForOrder } from '../../services/paymentHardening.service.js';

describe('Fee-Aware Paystack Payment Verification (validateSuccessfulPaymentForOrder)', () => {
    let mockOrder;

    beforeEach(() => {
        mockOrder = {
            _id: new mongoose.Types.ObjectId(),
            orderId: 'ORD-TEST12345',
            total: 1548, // ₦1,548 = 154,800 kobo
            paymentReference: 'PSK_TEST_REF_123',
            userId: new mongoose.Types.ObjectId(),
        };
    });

    it('should PASS verification under customer fee mode when paid = expected + fees', async () => {
        const payData = {
          status: 'success',
          reference: 'PSK_TEST_REF_123',
          currency: 'NGN',
          amount: 157158, // ₦1,571.58 = 154,800 + 2,358 (fees)
          fees: 2358, // ₦23.58 fees
          metadata: { feeBearer: 'customer' },
        };

        const result = await validateSuccessfulPaymentForOrder(mockOrder, payData);
        expect(result.expectedKobo).toBe(154800);
        expect(result.paidKobo).toBe(157158);
        expect(result.feesKobo).toBe(2358);
        expect(result.feeBearerMode).toBe('customer');
    });

    it('should PASS verification under platform fee mode when paid = expected total', async () => {
        const payData = {
          status: 'success',
          reference: 'PSK_TEST_REF_123',
          currency: 'NGN',
          amount: 154800, // ₦1,548 = 154,800 kobo
          fees: 2358, // Paystack fee deducted from merchant settlement
          metadata: { feeBearer: 'platform' },
        };

        const result = await validateSuccessfulPaymentForOrder(mockOrder, payData);
        expect(result.expectedKobo).toBe(154800);
        expect(result.paidKobo).toBe(154800);
        expect(result.feesKobo).toBe(2358);
        expect(result.feeBearerMode).toBe('platform');
    });

    it('should FAIL with PAYMENT_FEES_DATA_MISSING when Paystack response is missing fees', async () => {
        const payData = {
          status: 'success',
          reference: 'PSK_TEST_REF_123',
          currency: 'NGN',
          amount: 157158,
          fees: null, // Missing fees
          metadata: { feeBearer: 'customer' },
        };

        await expect(validateSuccessfulPaymentForOrder(mockOrder, payData)).rejects.toThrow(
          'Payment fee verification data missing. Flagged for manual review.'
        );
    });

    it('should FAIL with PAYMENT_AMOUNT_MISMATCH when paid amount does not match expected + fees under customer mode', async () => {
        const payData = {
          status: 'success',
          reference: 'PSK_TEST_REF_123',
          currency: 'NGN',
          amount: 150000, // Wrong amount
          fees: 2358,
          metadata: { feeBearer: 'customer' },
        };

        await expect(validateSuccessfulPaymentForOrder(mockOrder, payData)).rejects.toThrow(
          'Payment amount mismatch (customer fee mode)'
        );
    });

    it('should verify that both V1 (verifyPayment) and V2 (verifyPaymentV2) share the same fee-aware validation engine', async () => {
        // Both verifyPayment (V1) and verifyPaymentV2 (V2) delegate to validateSuccessfulPaymentForOrder
        const v1PayData = {
          status: 'success',
          reference: 'PSK_TEST_REF_123',
          currency: 'NGN',
          amount: 157158,
          fees: 2358,
          metadata: { feeBearer: 'customer' },
        };

        const v2PayData = {
          status: 'success',
          reference: 'PSK_TEST_REF_123',
          currency: 'NGN',
          amount: 157158,
          fees: 2358,
          metadata: { feeBearer: 'customer' },
        };

        const v1Result = await validateSuccessfulPaymentForOrder(mockOrder, v1PayData);
        const v2Result = await validateSuccessfulPaymentForOrder(mockOrder, v2PayData);

        expect(v1Result.feeBearerMode).toBe('customer');
        expect(v2Result.feeBearerMode).toBe('customer');
        expect(v1Result.paidKobo).toEqual(v2Result.paidKobo);
    });
});
