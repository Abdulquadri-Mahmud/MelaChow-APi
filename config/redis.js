import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisConfig = {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
        if (times > 5) {
            // Stop retrying after 5 attempts
            // null tells ioredis to stop — system falls back to MongoDB
            console.warn('⚠️ Redis retry limit reached — giving up, caching disabled');
            return null;
        }
        return Math.min(times * 200, 2000);
    }
};

const REDIS_URL = process.env.REDIS_URL;

export const redisClient = new Redis(REDIS_URL, redisConfig);
export const pubClient = redisClient.duplicate();
export const subClient = redisClient.duplicate();

// Error handling and connection logging
const redisClients = [
    { client: redisClient, name: 'main' },
    { client: pubClient,   name: 'pub'  },
    { client: subClient,   name: 'sub'  },
];

redisClients.forEach(({ client, name }) => {
    client.on('error', (err) => {
        console.warn(`⚠️ Redis [${name}] error:`, err.message || err.code || String(err));
    });
    client.on('connect', () => {
        console.log(`✅ Redis [${name}] connected`);
    });
    client.on('close', () => {
        console.log(`🔴 Redis [${name}] connection closed`);
    });
});

/**
 * Check if Redis is ready
 * @returns {boolean}
 */
export const isRedisReady = () => {
    return redisClient.status === 'ready';
};

/**
 * Safe Redis GET
 * @param {string} key 
 * @returns {Promise<string|null>}
 */
export const safeRedisGet = async (key) => {
    if (!isRedisReady()) return null;
    try {
        return await redisClient.get(key);
    } catch (err) {
        console.error(`❌ safeRedisGet failed for key ${key}:`, err.message);
        return null;
    }
};

/**
 * Safe Redis SET
 * @param {string} key 
 * @param {any} value 
 * @param {object} options 
 * @returns {Promise<boolean>}
 */
export const safeRedisSet = async (key, value, options = {}) => {
    if (!isRedisReady()) return false;
    try {
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        if (options.EX) {
            await redisClient.set(key, stringValue, 'EX', options.EX);
        } else {
            await redisClient.set(key, stringValue);
        }
        return true;
    } catch (err) {
        console.error(`❌ safeRedisSet failed for key ${key}:`, err.message);
        return false;
    }
};

export default redisClient;
