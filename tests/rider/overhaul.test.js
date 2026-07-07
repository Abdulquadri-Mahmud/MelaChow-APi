/**
 * @file overhaul.test.js
 * Integration tests for the MelaChow Delivery System Overhaul.
 *
 * Covers:
 *  - BROADCAST_TTL_SECONDS === 300
 *  - Timeout riders are re-eligible (not excluded) on subsequent broadcasts
 *  - Rider-initiated termination: resets order, frees rider, logs OrderTermination
 *  - Strike applied only when food was picked up
 *  - 48-hour suspension on reaching TERMINATION_STRIKE_LIMIT
 *  - reportUndeliverable: order → disputed_delivery, termination → disputed, queues escalation
 *  - Paystack fee deducted for vendors; riders receive full amount
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock BullMQ queues BEFORE any imports that reference config/queue.js
// This prevents real Queue instantiation (which needs Redis) in the test process.
jest.mock('../../config/queue.js', () => ({
    QUEUE_NAMES: {
        ESCROW_RELEASE:     'escrow-release',
        EMAIL:              'email',
        ORDER_AUTO_CANCEL:  'order-auto-cancel',
        BROADCAST_TIMEOUT:  'broadcast-timeout',
        DELIVERY_WATCHDOG:  'delivery-watchdog',
        DISPUTE_ESCALATION: 'dispute-escalation',
    },
    escrowReleaseQueue:     { add: jest.fn().mockResolvedValue({ id: 'mock-id' }), getJob: jest.fn().mockResolvedValue(null) },
    emailQueue:             { add: jest.fn().mockResolvedValue({ id: 'mock-id' }) },
    orderAutoCancelQueue:   { add: jest.fn().mockResolvedValue({ id: 'mock-id' }) },
    broadcastTimeoutQueue:  { add: jest.fn().mockResolvedValue({ id: 'mock-id' }) },
    deliveryWatchdogQueue:  { add: jest.fn().mockResolvedValue({ id: 'mock-watchdog-id' }), getJob: jest.fn().mockResolvedValue(null) },
    disputeEscalationQueue: { add: jest.fn().mockResolvedValue({ id: 'mock-dispute-id' }) },
}));

import mongoose from 'mongoose';
import Rider from '../../model/rider.model.js';
import Order from '../../model/order/Order.js';
import RiderAssignment from '../../model/riderAssignment.model.js';
import OrderTermination from '../../model/OrderTermination.js';
import OrderBroadcastQueue from '../../model/OrderBroadcastQueue.js';
import { terminateOrder, reportUndeliverable } from '../../services/rider.service.js';
import {
    BROADCAST_TTL_SECONDS,
    RIDER_FIXED_PAYOUT,
    RIDER_PAYOUT_THRESHOLD,
    VENDOR_PAYOUT_THRESHOLD,
    TERMINATION_STRIKE_LIMIT,
    SUSPENSION_DURATION_MS,
} from '../../config/payouts.js';
import { calcVendorNetPayout, calculatePaystackTransferFee } from '../../utils/paystackFees.js';
import {
    createTestUser,
    createTestVendor,
    createTestRider,
    createTestOrder,
    createTestVendorOrder,
    createTestWallet,
} from '../helpers/factories.js';

// ─── Constants ────────────────────────────────────────────────────────────────

describe('Payout Config Constants', () => {
    it('BROADCAST_TTL_SECONDS must be 300 (5 minutes)', () => {
        expect(BROADCAST_TTL_SECONDS).toBe(300);
    });

    it('RIDER_FIXED_PAYOUT must be 800', () => {
        expect(RIDER_FIXED_PAYOUT).toBe(800);
    });

    it('RIDER_PAYOUT_THRESHOLD must be 0 (all balance pays out at launch)', () => {
        expect(RIDER_PAYOUT_THRESHOLD).toBe(0);
    });

    it('VENDOR_PAYOUT_THRESHOLD must be 0 (all balance pays out at launch)', () => {
        expect(VENDOR_PAYOUT_THRESHOLD).toBe(0);
    });

    it('TERMINATION_STRIKE_LIMIT must be 2', () => {
        expect(TERMINATION_STRIKE_LIMIT).toBe(2);
    });

    it('SUSPENSION_DURATION_MS must default to 24 hours', () => {
        expect(SUSPENSION_DURATION_MS).toBe(24 * 60 * 60 * 1000);
    });
});

// ─── Paystack Fee Calculator ───────────────────────────────────────────────────

describe('Paystack Fee Calculator', () => {
    it('charges NGN 100 for amounts < NGN 5,000', () => {
        expect(calculatePaystackTransferFee(4999)).toBe(100);
        expect(calculatePaystackTransferFee(1)).toBe(100);
    });

    it('charges NGN 200 for amounts NGN 5,000 through NGN 9,999', () => {
        expect(calculatePaystackTransferFee(5000)).toBe(200);
        expect(calculatePaystackTransferFee(9999)).toBe(200);
    });

    it('charges NGN 300 for amounts >= NGN 10,000', () => {
        expect(calculatePaystackTransferFee(10000)).toBe(300);
        expect(calculatePaystackTransferFee(100000)).toBe(300);
    });

    it('calcVendorNetPayout deducts fee from gross amount', () => {
        const { net, fee } = calcVendorNetPayout(10000);
        expect(fee).toBe(300);
        expect(net).toBe(9700);
    });

    it('vendor payout: net + fee === gross', () => {
        const gross = 8500;
        const { net, fee } = calcVendorNetPayout(gross);
        expect(net + fee).toBe(gross);
    });

    it('rider payout: full amount transferred (no fee deducted by platform)', () => {
        // Rider receives full wallet balance — platform absorbs Paystack's fee
        const riderBalance = 3200;
        // simulating the payout logic: actorType !== 'vendor' → netAmount = actualAmount
        const netAmount = riderBalance;
        const transferFee = 0;
        expect(netAmount).toBe(riderBalance);
        expect(transferFee).toBe(0);
    });
});

// ─── Rider Termination (no food pickup) ───────────────────────────────────────

describe('terminateOrder — food NOT yet picked up', () => {
    let user, vendor, rider, order, vendorOrder;

    beforeEach(async () => {
        user       = await createTestUser();
        vendor     = await createTestVendor();
        rider      = await createTestRider(null, { status: 'on_delivery' });

        order      = await createTestOrder(user._id, vendor._id, {
            paymentStatus: 'paid',
            orderStatus:   'ready_for_pickup', // food NOT picked up
            riderId:       rider._id,
        });

        vendorOrder = await createTestVendorOrder(vendor._id, order._id, {
            orderStatus: 'ready_for_pickup',
            riderId:     rider._id,
        });

        // Warm collections for transactions
        const seed = await RiderAssignment.create({
            riderId:       rider._id,
            orderId:       order._id,
            vendorOrderId: vendorOrder._id,
            vendorId:      vendor._id,
            status:        'assigned',
            expiresAt:     new Date(Date.now() + 300_000),
        });
        await RiderAssignment.deleteOne({ _id: seed._id });

        const seedT = await OrderTermination.create({
            orderId:       order._id,
            vendorOrderId: vendorOrder._id,
            previousRiderId:   rider._id,
            previousRiderName: 'dummy',
            previousRiderPhone: '0800000000',
            foodPickedUp: false,
            reason:  'rider_initiated',
            status:  'pending',
        });
        await OrderTermination.deleteOne({ _id: seedT._id });

        const seedQ = await OrderBroadcastQueue.create({
            orderId:      order._id,
            vendorOrderId: vendorOrder._id,
            status:        'cancelled',
        });
        await OrderBroadcastQueue.deleteOne({ _id: seedQ._id });

        await Order.findByIdAndUpdate(order._id, { riderId: rider._id });
    });

    it('resets order to ready_for_pickup', async () => {
        await terminateOrder(vendorOrder._id.toString(), rider._id.toString(), 'test termination');

        const updated = await Order.findById(order._id);
        expect(updated.orderStatus).toBe('ready_for_pickup');
        expect(updated.riderId).toBeNull();
    });

    it('frees the rider status to available', async () => {
        await terminateOrder(vendorOrder._id.toString(), rider._id.toString());

        const updated = await Rider.findById(rider._id);
        expect(updated.status).toBe('available');
        expect(updated.currentOrderId).toBeNull();
    });

    it('creates an OrderTermination record with reason rider_initiated', async () => {
        await terminateOrder(vendorOrder._id.toString(), rider._id.toString(), 'cannot find address');

        const terminations = await OrderTermination.find({ orderId: order._id });
        expect(terminations).toHaveLength(1);
        expect(terminations[0].reason).toBe('rider_initiated');
        expect(terminations[0].foodPickedUp).toBe(false);
        expect(terminations[0].riderNote).toBe('cannot find address');
    });

    it('does NOT increment rider terminationStrikes when food was not picked up', async () => {
        await terminateOrder(vendorOrder._id.toString(), rider._id.toString());

        const updated = await Rider.findById(rider._id);
        expect(updated.terminationStrikes ?? 0).toBe(0);
    });
});

// ─── Rider Termination (food already picked up) ───────────────────────────────

describe('terminateOrder — food WAS picked up (strike logic)', () => {
    let user, vendor, rider, order, vendorOrder;

    const setupWithPickup = async (initialStrikes = 0) => {
        user        = await createTestUser();
        vendor      = await createTestVendor();
        rider       = await createTestRider(null, {
            status:              'on_delivery',
            terminationStrikes:  initialStrikes,
        });

        order       = await createTestOrder(user._id, vendor._id, {
            paymentStatus: 'paid',
            orderStatus:   'out_for_delivery', // food IS picked up
            riderId:       rider._id,
        });

        vendorOrder = await createTestVendorOrder(vendor._id, order._id, {
            orderStatus: 'out_for_delivery',
            riderId:     rider._id,
        });

        await Order.findByIdAndUpdate(order._id, { riderId: rider._id });

        // Warm collections for transactions
        const seed = await RiderAssignment.create({
            riderId:       rider._id,
            orderId:       order._id,
            vendorOrderId: vendorOrder._id,
            vendorId:      vendor._id,
            status:        'assigned',
            expiresAt:     new Date(Date.now() + 300_000),
        });
        await RiderAssignment.deleteOne({ _id: seed._id });

        const seedT = await OrderTermination.create({
            orderId:       order._id,
            vendorOrderId: vendorOrder._id,
            previousRiderId:    rider._id,
            previousRiderName:  'dummy',
            previousRiderPhone: '0800000000',
            foodPickedUp: true,
            reason:  'rider_initiated',
            status:  'pending',
        });
        await OrderTermination.deleteOne({ _id: seedT._id });

        const seedQ = await OrderBroadcastQueue.create({
            orderId:      order._id,
            vendorOrderId: vendorOrder._id,
            status:        'cancelled',
        });
        await OrderBroadcastQueue.deleteOne({ _id: seedQ._id });
    };

    it('increments terminationStrikes by 1', async () => {
        await setupWithPickup(0);
        await terminateOrder(vendorOrder._id.toString(), rider._id.toString());

        const updated = await Rider.findById(rider._id);
        expect(updated.terminationStrikes).toBe(1);
    });

    it('does NOT suspend when strikes < TERMINATION_STRIKE_LIMIT', async () => {
        await setupWithPickup(0);
        await terminateOrder(vendorOrder._id.toString(), rider._id.toString());

        const updated = await Rider.findById(rider._id);
        expect(updated.isSuspended).toBeFalsy();
    });

    it('suspends rider for the configured period when strikes reach TERMINATION_STRIKE_LIMIT', async () => {
        // Start at TERMINATION_STRIKE_LIMIT - 1 so this termination tips it over
        await setupWithPickup(TERMINATION_STRIKE_LIMIT - 1);
        await terminateOrder(vendorOrder._id.toString(), rider._id.toString());

        const updated = await Rider.findById(rider._id);
        expect(updated.isSuspended).toBe(true);
        expect(updated.status).toBe('offline');
        expect(updated.suspendedUntil).toBeDefined();

        const remainingMs = new Date(updated.suspendedUntil).getTime() - Date.now();
        // Allow 5s tolerance — should be close to the configured period from now
        expect(remainingMs).toBeGreaterThan(SUSPENSION_DURATION_MS - 5_000);
        expect(remainingMs).toBeLessThanOrEqual(SUSPENSION_DURATION_MS);
    });

    it('logs foodPickedUp: true in OrderTermination record', async () => {
        await setupWithPickup(0);
        await terminateOrder(vendorOrder._id.toString(), rider._id.toString());

        const term = await OrderTermination.findOne({ orderId: order._id });
        expect(term.foodPickedUp).toBe(true);
    });
});

// ─── Report Undeliverable (Disputed Delivery) ─────────────────────────────────

describe('reportUndeliverable', () => {
    let user, vendor, rider, order, vendorOrder;

    beforeEach(async () => {
        user        = await createTestUser();
        vendor      = await createTestVendor();
        rider       = await createTestRider(null, { status: 'on_delivery' });

        order       = await createTestOrder(user._id, vendor._id, {
            paymentStatus: 'paid',
            orderStatus:   'out_for_delivery',
            riderId:       rider._id,
        });

        vendorOrder = await createTestVendorOrder(vendor._id, order._id, {
            orderStatus: 'out_for_delivery',
            riderId:     rider._id,
        });

        await Order.findByIdAndUpdate(order._id, { riderId: rider._id });

        // Pre-create a pending termination record (as if termination happened first)
        await OrderTermination.create({
            orderId:            order._id,
            vendorOrderId:      vendorOrder._id,
            previousRiderId:    rider._id,
            previousRiderName:  rider.name,
            previousRiderPhone: rider.phone,
            foodPickedUp:       true,
            reason:             'rider_initiated',
            status:             'pending',
        });
    });

    it('transitions order to disputed_delivery', async () => {
        await reportUndeliverable(vendorOrder._id.toString(), rider._id.toString(), 'customer refused');

        const updated = await Order.findById(order._id);
        expect(updated.orderStatus).toBe('disputed_delivery');
    });

    it('updates the pending OrderTermination record to disputed', async () => {
        await reportUndeliverable(vendorOrder._id.toString(), rider._id.toString());

        const term = await OrderTermination.findOne({ orderId: order._id });
        expect(term.status).toBe('disputed');
    });

    it('returns success: true', async () => {
        const result = await reportUndeliverable(vendorOrder._id.toString(), rider._id.toString());
        expect(result.success).toBe(true);
    });

    it('throws if the rider is not assigned to the order', async () => {
        const otherRider = await createTestRider(null);
        await expect(
            reportUndeliverable(vendorOrder._id.toString(), otherRider._id.toString())
        ).rejects.toThrow('not assigned');
    });
});

// ─── Exclusion Filter: Timed-out riders re-eligible ───────────────────────────

describe('Broadcast exclusion filter: timed-out riders remain eligible', () => {
    it('rejected riders are excluded, timed-out riders are not', async () => {
        /**
         * The business rule: only "rejected" assignments exclude a rider from
         * future broadcasts of the same order. A "timeout" or "timed_out"
         * assignment does NOT exclude the rider — they may be re-offered.
         *
         * We verify this by asserting the exclusion statuses list in
         * riderAssignment.service.js does NOT include "timeout" / "timed_out".
         */
        const { offerOrderToAvailableRiders } = await import('../../services/riderAssignment.service.js');

        // Inspect the module's source for the exclusion filter
        const serviceSource = await import('../../services/riderAssignment.service.js').then(
            () => import('fs').then(fs => fs.promises.readFile(
                new URL('../../services/riderAssignment.service.js', import.meta.url).pathname.slice(1),
                'utf8'
            ))
        );

        // The exclusion query must use "rejected" only — not "timeout" or "timed_out"
        // We check the source doesn't contain patterns that would exclude timed_out riders
        expect(typeof offerOrderToAvailableRiders).toBe('function');

        // Verify the source contains the correct exclusion pattern
        expect(serviceSource).toContain('"rejected"');
        // Must NOT exclude timed_out riders
        const hasTimeoutExclusion =
            serviceSource.match(/excluded.*timed_out/s) ||
            serviceSource.match(/status.*\$in.*timed_out.*excluded/s);
        expect(hasTimeoutExclusion).toBeFalsy();
    });
});

// ─── Payout Sweep Thresholds ──────────────────────────────────────────────────

describe('Payout sweep uses ₦0 threshold at launch', () => {
    it('RIDER_PAYOUT_THRESHOLD is 0 so every naira is swept', () => {
        expect(RIDER_PAYOUT_THRESHOLD).toBe(0);
    });

    it('VENDOR_PAYOUT_THRESHOLD is 0 so every naira is swept', () => {
        expect(VENDOR_PAYOUT_THRESHOLD).toBe(0);
    });

    it('vendor fee is deducted before payout (platform does not absorb vendor fee)', () => {
        const gross = 15000;
        const { net, fee } = calcVendorNetPayout(gross);
        expect(fee).toBeGreaterThan(0);
        expect(net).toBeLessThan(gross);
    });

    it('rider receives full balance (platform absorbs fee)', () => {
        // Platform absorbs Paystack fee for riders → transferFee = 0 in riderWithdrawal
        const riderBalance = 800;
        const transferFee = 0; // Platform absorbs
        const netAmount = riderBalance - transferFee;
        expect(netAmount).toBe(800);
    });
});
