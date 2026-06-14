import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { jest } from '@jest/globals';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_key';
process.env.MONGOMS_MD5_CHECK = process.env.MONGOMS_MD5_CHECK || 'false';
process.env.IP_HASH_SALT = process.env.IP_HASH_SALT || 'test-ip-hash-salt';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'https://melachow.com';

let mongod;

// Start in-memory MongoDB before all tests
beforeAll(async () => {
    if (process.env.SKIP_MONGO === 'true') return;
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
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
        ESCROW_RELEASE: 'escrow-release',
        EMAIL: 'email',
        ORDER_AUTO_CANCEL: 'order-auto-cancel',
    },
    escrowReleaseQueue: {
        add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    },
    emailQueue: {
        add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    },
    orderAutoCancelQueue: {
        add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    },
}));

// Prevent workers from initializing during tests
jest.mock('../workers/index.js', () => ({}));
