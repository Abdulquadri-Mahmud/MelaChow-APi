/**
 * Tests for tokenBlocklist.js
 * These verify the blocklist storage and lookup logic using a mocked Redis client.
 */
import { jest } from "@jest/globals";

// Mock the Redis module before importing tokenBlocklist
jest.mock("../../config/redis.js");

import redisClient from "../../config/redis.js";

// Import after mocking — order matters
import { isTokenBlocked, blockToken } from "../../middleware/tokenBlocklist.js";

const SAMPLE_TOKEN = "eyJhbGciOiJIUzI1NiJ9.sample.token";
const BLOCKLIST_PREFIX = "blocklist:";
const BLOCKLIST_KEY = `${BLOCKLIST_PREFIX}${SAMPLE_TOKEN}`;

describe("tokenBlocklist — isTokenBlocked", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default: Redis is open
        redisClient.isOpen = true;
    });

    it("returns true when token exists in Redis (blocked)", async () => {
        redisClient.get = jest.fn().mockResolvedValue("1");

        const result = await isTokenBlocked(SAMPLE_TOKEN);

        expect(redisClient.get).toHaveBeenCalledWith(BLOCKLIST_KEY);
        expect(result).toBe(true);
    });

    it("returns false when token does NOT exist in Redis (not blocked)", async () => {
        redisClient.get = jest.fn().mockResolvedValue(null);

        const result = await isTokenBlocked(SAMPLE_TOKEN);

        expect(redisClient.get).toHaveBeenCalledWith(BLOCKLIST_KEY);
        expect(result).toBe(false);
    });

    it("returns false when Redis is NOT open", async () => {
        redisClient.isOpen = false;
        redisClient.get = jest.fn();

        const result = await isTokenBlocked(SAMPLE_TOKEN);

        expect(redisClient.get).not.toHaveBeenCalled();
        expect(result).toBe(false);
    });

    it("returns false gracefully when Redis throws", async () => {
        redisClient.get = jest.fn().mockRejectedValue(new Error("Redis connection refused"));

        const result = await isTokenBlocked(SAMPLE_TOKEN);

        expect(result).toBe(false);
    });
});

describe("tokenBlocklist — blockToken", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("stores token in Redis with a TTL matching remaining token lifetime", async () => {
        redisClient.set = jest.fn().mockResolvedValue("OK");

        // mock Date.now() to control the calculation
        const nowInSeconds = 1700000000;
        jest.spyOn(Date, 'now').mockReturnValue(nowInSeconds * 1000);

        const expTimestamp = nowInSeconds + 3600; // 1 hour remaining
        await blockToken(SAMPLE_TOKEN, expTimestamp);

        expect(redisClient.set).toHaveBeenCalledWith(
            BLOCKLIST_KEY,
            '1',
            { EX: 3600 }
        );
    });

    it("does not store token if TTL is zero or negative (already expired)", async () => {
        redisClient.set = jest.fn();

        const nowInSeconds = Math.floor(Date.now() / 1000);
        await blockToken(SAMPLE_TOKEN, nowInSeconds - 100);

        expect(redisClient.set).not.toHaveBeenCalled();
    });

    it("fails gracefully when Redis write fails without throwing", async () => {
        redisClient.set = jest.fn().mockRejectedValue(new Error("Redis write failed"));

        const nowInSeconds = Math.floor(Date.now() / 1000);
        await expect(blockToken(SAMPLE_TOKEN, nowInSeconds + 100)).resolves.not.toThrow();
    });
});
