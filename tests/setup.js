import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { jest } from '@jest/globals';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_key';
process.env.MONGOMS_MD5_CHECK = process.env.MONGOMS_MD5_CHECK || 'false';
process.env.IP_HASH_SALT = process.env.IP_HASH_SALT || 'test-ip-hash-salt';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'https://melachow.com';
process.env.BYPASS_OTP = 'true';

let mongod;

// Start in-memory MongoDB before all tests
beforeAll(async () => {
    if (process.env.SKIP_MONGO === 'true') return;
    mongod = await MongoMemoryReplSet.create({
        replSet: { count: 1 }
    });
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    // Ensure all model indexes are built to prevent catalog changes errors during transactions
    await Promise.all(
        Object.values(mongoose.models).map(model => 
            model.ensureIndexes().catch(err => 
                console.warn(`⚠️ Mongoose ensureIndexes failed for ${model.modelName}:`, err.message)
            )
        )
    );
});

// Clean all collections between tests
afterEach(async () => {
    if (process.env.SKIP_MONGO === 'true') return;
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});

// Disconnect and stop MongoDB after all tests
afterAll(async () => {
    if (process.env.SKIP_MONGO === 'true') return;
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

// Mock nodemailer so no real emails are sent
jest.mock('../config/mailer.js', () => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
}));

// Mock axios globally — prevents real HTTP calls to Paystack/Termii
jest.mock('axios');

// Prevent BullMQ queue connections from opening during tests
jest.mock('../config/queue.js', () => ({
    QUEUE_NAMES: {
        ESCROW_RELEASE:     'escrow-release',
        EMAIL:              'email',
        ORDER_AUTO_CANCEL:  'order-auto-cancel',
        BROADCAST_TIMEOUT:  'broadcast-timeout',
        DELIVERY_WATCHDOG:  'delivery-watchdog',
        DISPUTE_ESCALATION: 'dispute-escalation',
    },
    escrowReleaseQueue: {
        add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
        getJob: jest.fn().mockResolvedValue(null),
    },
    emailQueue: {
        add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    },
    orderAutoCancelQueue: {
        add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    },
    broadcastTimeoutQueue: {
        add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    },
    deliveryWatchdogQueue: {
        add: jest.fn().mockResolvedValue({ id: 'mock-watchdog-job-id' }),
        getJob: jest.fn().mockResolvedValue(null),
    },
    disputeEscalationQueue: {
        add: jest.fn().mockResolvedValue({ id: 'mock-dispute-job-id' }),
    },
}));

// Prevent workers from initializing during tests
jest.mock('../workers/index.js', () => ({}));
