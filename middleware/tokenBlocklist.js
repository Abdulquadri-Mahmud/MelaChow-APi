import redisClient from '../config/redis.js';

const BLOCKLIST_PREFIX = 'blocklist:';

/**
 * Add a token to the Redis blocklist.
 * TTL is set to the token's remaining lifetime so Redis auto-purges expired entries.
 * @param {string} token - The raw JWT string
 * @param {number} expTimestamp - The token's `exp` claim (Unix seconds)
 */
export const blockToken = async (token, expTimestamp) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const ttl = expTimestamp - now;
    if (ttl <= 0) return; // Already expired, no need to block
    await redisClient.set(`${BLOCKLIST_PREFIX}${token}`, '1', { EX: ttl });
  } catch (err) {
    console.error('❌ Failed to add token to blocklist:', err.message);
    // Non-fatal — log and continue
  }
};

/**
 * Check if a token is in the blocklist.
 * @param {string} token - The raw JWT string
 * @returns {boolean}
 */
export const isTokenBlocked = async (token) => {
  try {
    // If Redis is not connected, skip the check
    if (!redisClient.isOpen) {
        return false;
    }
    const result = await redisClient.get(`${BLOCKLIST_PREFIX}${token}`);
    return result !== null;
  } catch (err) {
    console.error('❌ Blocklist check failed:', err.message);
    // Fail open — if Redis is down, don't lock out all users
    // This is an acceptable tradeoff; log it and monitor
    return false;
  }
};
