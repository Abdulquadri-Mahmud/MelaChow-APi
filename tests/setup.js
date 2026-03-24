import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { jest } from '@jest/globals';

let mongod;

// Start in-memory MongoDB before all tests
beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
});

// Clean all collections between tests
afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});

// Disconnect and stop MongoDB after all tests
afterAll(async () => {
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

