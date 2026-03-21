import { Queue, Worker, QueueEvents } from 'bullmq';
import { bullmqRedisConnection } from './redis.js';
import logger from './logger.js';

// ─── Queue Names ──────────────────────────────────────────────────────────────
export const QUEUE_NAMES = {
    ESCROW_RELEASE:     'escrow-release',
    EMAIL:              'email',
    ORDER_AUTO_CANCEL:  'order-auto-cancel',
};

// ─── Queue Instances ──────────────────────────────────────────────────────────
// Each queue uses a duplicate of the BullMQ connection.
// BullMQ requires separate connections for Queue and Worker.

export const escrowReleaseQueue = new Queue(QUEUE_NAMES.ESCROW_RELEASE, {
    connection: bullmqRedisConnection.duplicate(),
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 2000,    // 2s, 4s, 8s, 16s, 32s
        },
        removeOnComplete: { count: 100 },   // Keep last 100 completed jobs
        removeOnFail: { count: 500 },       // Keep last 500 failed jobs for audit
    },
});

export const emailQueue = new Queue(QUEUE_NAMES.EMAIL, {
    connection: bullmqRedisConnection.duplicate(),
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'fixed',
            delay: 5000,    // Retry after 5s — SMTP is usually transient
        },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
    },
});

export const orderAutoCancelQueue = new Queue(QUEUE_NAMES.ORDER_AUTO_CANCEL, {
    connection: bullmqRedisConnection.duplicate(),
    defaultJobOptions: {
        attempts: 1,        // Auto-cancel is a one-shot operation
        removeOnComplete: true,
        removeOnFail: { count: 100 },
    },
});

// ─── Queue Event Logging ──────────────────────────────────────────────────────
const queues = [
    { queue: escrowReleaseQueue,    name: QUEUE_NAMES.ESCROW_RELEASE },
    { queue: emailQueue,            name: QUEUE_NAMES.EMAIL },
    { queue: orderAutoCancelQueue,  name: QUEUE_NAMES.ORDER_AUTO_CANCEL },
];

queues.forEach(({ queue, name }) => {
    const events = new QueueEvents(name, {
        connection: bullmqRedisConnection.duplicate()
    });

    events.on('completed', ({ jobId }) => {
        logger.info({ jobId, queue: name }, `✅ Job completed`);
    });

    events.on('failed', ({ jobId, failedReason }) => {
        logger.error({ jobId, queue: name, reason: failedReason }, `❌ Job failed`);
    });

    events.on('stalled', ({ jobId }) => {
        logger.warn({ jobId, queue: name }, `⚠️ Job stalled`);
    });
});

logger.info('✅ BullMQ queues initialized');
