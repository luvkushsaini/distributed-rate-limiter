/**
 * Fixed Window Rate Limiting Algorithm
 *
 * Why INCR instead of GET-then-SET:
 * INCR is atomic — two concurrent requests cannot read the same value.
 * GET-then-SET has a race condition: both threads read count=99, both write count=100,
 * and a 101st request sneaks through. INCR guarantees unique, sequential counter values.
 */
const { redisClient } = require('../store/redisClient');
const logger = require('../utils/logger');

/**
 * Generate a Redis key for the fixed window counter
 *
 * @param {string} identifier - The user ID, IP address, or API key
 * @param {string} endpoint - The API endpoint being rate limited
 * @returns {string} Redis key in format "fixed:{identifier}:{endpoint}"
 */
const generateKey = (identifier, endpoint) => {
    return `fixed:${identifier}:${endpoint}`;
};

/**
 * Check if a request is allowed under the fixed window rate limit
 *
 * Fail-open: if Redis is down, allow the request through.
 * Availability is more important than perfect rate limiting.
 *
 * @param {string} identifier - The user ID, IP address, or API key
 * @param {string} endpoint - The API endpoint being accessed
 * @param {Object} config - Rate limit configuration
 * @param {number} config.limit - Maximum requests allowed per window
 * @param {number} config.windowSeconds - Window duration in seconds
 * @returns {Promise<Object>} Rate limit result with allowed, remaining, resetAt, etc.
 */
const checkFixedWindow = async (identifier, endpoint, config) => {
    const { limit, windowSeconds } = config;
    const key = generateKey(identifier, endpoint);

    try {
        const currentCount = await redisClient.incr(key);

        // Only set EXPIRE on first request to avoid resetting the window mid-flight
        if (currentCount === 1) {
            await redisClient.expire(key, windowSeconds);
        }

        const ttl = await redisClient.ttl(key);
        const resetAt = Math.floor(Date.now() / 1000) + ttl;
        const allowed = currentCount <= limit;
        const remaining = allowed ? limit - currentCount : 0;

        logger.info('Fixed window rate limit check', {
            key,
            currentCount,
            limit,
            allowed,
            remaining,
            ttl,
        });

        return {
            allowed,
            remaining,
            resetAt,
            limit,
            windowSeconds,
            algorithm: 'fixed-window',
        };
    } catch (err) {
        // Fail-open: allow request through if Redis is down
        logger.error('Fixed window check failed — allowing request (fail-open)', {
            error: err.message,
            identifier,
            endpoint,
        });

        return {
            allowed: true,
            remaining: limit,
            resetAt: Math.floor(Date.now() / 1000) + windowSeconds,
            limit,
            windowSeconds,
            algorithm: 'fixed-window',
        };
    }
};

/**
 * Reset the rate limit counter for a specific identifier and endpoint
 *
 * @param {string} identifier - The user ID, IP address, or API key
 * @param {string} endpoint - The API endpoint
 * @returns {Promise<boolean>} true if the key existed and was deleted, false otherwise
 */
const resetLimit = async (identifier, endpoint) => {
    const key = generateKey(identifier, endpoint);

    try {
        const result = await redisClient.del(key);

        logger.info('Rate limit reset', {
            key,
            existed: result === 1,
        });

        return result === 1;
    } catch (err) {
        logger.error('Failed to reset rate limit', {
            error: err.message,
            key,
        });

        return false;
    }
};

module.exports = { generateKey, checkFixedWindow, resetLimit };
