import { Worker } from 'bullmq';
import { bullmqRedisConnection } from '../config/redis.js';
import { QUEUE_NAMES } from '../config/queue.js';
import logger from '../config/logger.js';
import { refundOrderToWallet } from '../services/refund.service.js';

// ─── Escrow Release Worker ────────────────────────────────────────────────────
const escrowReleaseWorker = new Worker(
    QUEUE_NAMES.ESCROW_RELEASE,
    async (job) => {
        const { vendorOrderId } = job.data;

        if (!vendorOrderId) {
            throw new Error('vendorOrderId is required for escrow release job');
        }

        logger.info({ vendorOrderId, attempt: job.attemptsMade + 1 }, '🔄 Processing escrow release');

        // Dynamic import to avoid circular dependencies at startup
        const { releaseEscrowToVendor } = await import('../controller/order/createOrderV2.controller.js');
        await releaseEscrowToVendor(vendorOrderId);

        logger.info({ vendorOrderId }, '✅ Escrow release job completed');
    },
    {
        connection: bullmqRedisConnection.duplicate(),
        concurrency: 5,     // Process up to 5 escrow releases simultaneously
    }
);

// ─── Email Worker ─────────────────────────────────────────────────────────────
const emailWorker = new Worker(
    QUEUE_NAMES.EMAIL,
    async (job) => {
        const { type, to, subject, html, text } = job.data;

        logger.info({ type, to, attempt: job.attemptsMade + 1 }, '📧 Processing email job');

        const { default: transporter } = await import('../config/mailer.js');

        await transporter.sendMail({
            from: process.env.MAIL_FROM || process.env.EMAIL_USER,
            to,
            subject,
            html,
            text,
        });

        logger.info({ type, to }, '✅ Email job completed');
    },
    {
        connection: bullmqRedisConnection.duplicate(),
        concurrency: 3,
    }
);

// ─── Order Auto-Cancel Worker ─────────────────────────────────────────────────
const orderAutoCancelWorker = new Worker(
    QUEUE_NAMES.ORDER_AUTO_CANCEL,
    async (job) => {
        const { orderId, vendorOrderId } = job.data;

        logger.info({ orderId, vendorOrderId }, '⏰ Checking order for auto-cancellation');

        const Order     = (await import('../model/order/Order.js')).default;
        const VendorOrder = (await import('../model/vendor/VendorOrder.js')).default;

        // Re-fetch current state — order may have been accepted since job was queued
        const order = await Order.findById(orderId);
        if (!order) {
            logger.warn({ orderId }, 'Order not found for auto-cancel — skipping');
            return;
        }

        // Only cancel if still in pending state — do not cancel accepted/preparing orders
        if (order.orderStatus !== 'pending') {
            logger.info({ orderId, currentStatus: order.orderStatus }, '⏭️ Order no longer pending — auto-cancel skipped');
            return;
        }

        // Cancel the order
        order.orderStatus = 'cancelled';
        order.statusLog.push({
            status: 'cancelled',
            changedBy: 'system',
            note: 'Auto-cancelled: vendor did not respond within 15 minutes',
            timestamp: new Date(),
        });
        await order.save();

        // Cancel the vendor order too
        if (vendorOrderId) {
            await VendorOrder.findByIdAndUpdate(vendorOrderId, {
                orderStatus: 'cancelled'
            });
        }

        logger.info({ orderId }, '✅ Order auto-cancelled — vendor did not respond in time');

        try {
            await refundOrderToWallet(orderId, 'auto_cancel');
            logger.info({ orderId }, '✅ Auto-cancel refund completed');
        } catch (refundErr) {
            logger.error({ orderId, error: refundErr.message }, '❌ Auto-cancel refund failed');
            throw refundErr; // Re-throw — BullMQ will retry
        }
    },
    {
        connection: bullmqRedisConnection.duplicate(),
        concurrency: 10,
    }
);

// ─── Worker Error Handling ────────────────────────────────────────────────────
[escrowReleaseWorker, emailWorker, orderAutoCancelWorker].forEach(worker => {
    worker.on('failed', (job, err) => {
        logger.error(
            { jobId: job?.id, queue: worker.name, error: err.message, attempts: job?.attemptsMade },
            '❌ Worker job failed'
        );
    });

    worker.on('error', (err) => {
        logger.error({ queue: worker.name, error: err.message }, '❌ Worker error');
    });
});

logger.info('✅ BullMQ workers initialized');

export { escrowReleaseWorker, emailWorker, orderAutoCancelWorker };
