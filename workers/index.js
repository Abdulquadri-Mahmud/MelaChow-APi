import { Worker } from 'bullmq';
import { bullmqRedisConnection } from '../config/redis.js';
import { QUEUE_NAMES } from '../config/queue.js';
import logger from '../config/logger.js';
import { refundOrderToWallet } from '../services/refund.service.js';
import { broadcastTimeoutWorker } from './broadcastTimeout.worker.js';
import './deliveryWatchdog.worker.js';
import './disputeEscalation.worker.js';

const escrowReleaseWorker = new Worker(
    QUEUE_NAMES.ESCROW_RELEASE,
    async (job) => {
        const { vendorOrderId } = job.data;

        if (!vendorOrderId) {
            throw new Error('vendorOrderId is required for escrow release job');
        }

        logger.info({ vendorOrderId, attempt: job.attemptsMade + 1 }, 'Processing escrow release');

        const { releaseEscrowToVendor } = await import('../controller/order/createOrderV2.controller.js');
        await releaseEscrowToVendor(vendorOrderId);

        logger.info({ vendorOrderId }, 'Escrow release job completed');
    },
    {
        connection: bullmqRedisConnection.duplicate(),
        concurrency: 5,
    }
);

const emailWorker = new Worker(
    QUEUE_NAMES.EMAIL,
    async (job) => {
        const { type, to, subject, html, text } = job.data;

        logger.info({ type, to, attempt: job.attemptsMade + 1 }, 'Processing email job');

        const { default: transporter } = await import('../config/mailer.js');

        await transporter.sendMail({
            from: process.env.MAIL_FROM || process.env.EMAIL_USER,
            to,
            subject,
            html,
            text,
        });

        logger.info({ type, to }, 'Email job completed');
    },
    {
        connection: bullmqRedisConnection.duplicate(),
        concurrency: 3,
    }
);

const orderAutoCancelWorker = new Worker(
    QUEUE_NAMES.ORDER_AUTO_CANCEL,
    async (job) => {
        const { orderId, orderCode, vendorOrderId } = job.data;

        logger.info({ orderId, vendorOrderId }, 'Checking vendor order for auto-cancellation');

        const Order = (await import('../model/order/Order.js')).default;
        const VendorOrder = (await import('../model/vendor/VendorOrder.js')).default;
        const Vendor = (await import('../model/vendor/vendor.model.js')).default;
        const { sendOrderNotification, sendVendorNotification } = await import('../services/notification.service.js');

        if (!vendorOrderId) {
            throw new Error('vendorOrderId is required for vendor auto-cancel job');
        }

        const vendorOrder = await VendorOrder.findById(vendorOrderId);
        if (!vendorOrder) {
            logger.warn({ vendorOrderId }, 'Vendor order not found for auto-cancel - skipping');
            return;
        }

        if (vendorOrder.orderStatus !== 'pending') {
            logger.info(
                { orderId, vendorOrderId, currentStatus: vendorOrder.orderStatus },
                'Vendor order no longer pending - auto-cancel skipped'
            );
            return;
        }

        const order = await Order.findById(vendorOrder.userOrderId || orderId);
        if (!order) {
            logger.warn({ orderId, vendorOrderId }, 'Parent order not found for auto-cancel - skipping');
            return;
        }

        logger.info(
            { orderId: order._id, vendorOrderId },
            'Vendor timeout confirmed - cancelling order and refunding customer'
        );

        try {
            await refundOrderToWallet(order._id, 'auto_cancel');
            logger.info({ orderId: order._id, vendorOrderId }, 'Auto-cancel refund completed');

            const vendor = await Vendor.findById(vendorOrder.restaurantId).select('storeName');
            const restaurantName = vendor?.storeName || 'the restaurant';

            await Promise.allSettled([
                sendOrderNotification(order.userId, order.orderId || orderCode, 'cancelled', {
                    orderDatabaseId: order._id,
                    restaurantName,
                    cancellationReason: 'vendor_timeout',
                    message: 'The restaurant did not confirm this order in time. Your payment has been returned to your MelaChow wallet.',
                }),
                sendVendorNotification(vendorOrder.restaurantId, order.orderId || orderCode, 'vendor_order_timeout', {
                    orderDatabaseId: vendorOrder._id,
                    restaurantName,
                    totalAmount: order.total,
                }),
            ]);
        } catch (refundErr) {
            logger.error({ orderId, vendorOrderId, error: refundErr.message }, 'Auto-cancel refund failed');
            throw refundErr;
        }
    },
    {
        connection: bullmqRedisConnection.duplicate(),
        concurrency: 10,
    }
);

[escrowReleaseWorker, emailWorker, orderAutoCancelWorker, broadcastTimeoutWorker].forEach(worker => {
    worker.on('failed', (job, err) => {
        logger.error(
            { jobId: job?.id, queue: worker.name, error: err.message, attempts: job?.attemptsMade },
            'Worker job failed'
        );
    });

    worker.on('error', (err) => {
        logger.error({ queue: worker.name, error: err.message }, 'Worker error');
    });
});

logger.info('BullMQ workers initialized');

export { escrowReleaseWorker, emailWorker, orderAutoCancelWorker, broadcastTimeoutWorker };
