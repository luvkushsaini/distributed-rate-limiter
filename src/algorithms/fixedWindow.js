/**
 * Fixed Window rate limiter — uses INCR for atomic counting.
 * Each window is a simple key with TTL equal to the window duration.
 */
const { redisClient } = require('../store/redisClient');
const logger = require('../utils/logger');

/**
 * Generate a Redis key for the fixed window counter.
 */
const generateKey = (identifier, endpoint) => {
    return `fixed:${identifier}:${endpoint}`;
};

/**
 * Check if a request is allowed under the fixed window limit.
 * INCR is atomic — no race condition between read and write.
 */
const checkFixedWindow = async (identifier, endpoint, config) => {
    const { limit, windowSeconds } = config;
    const key = generateKey(identifier, endpoint);

    try {
        const currentCount = await redisClient.incr(key);

        // Only set TTL on first request so we don't reset the window mid-flight
        if (currentCount === 1) {
            await redisClient.expire(key, windowSeconds);
        }

        const ttl = await redisClient.ttl(key);
        const resetAt = Math.floor(Date.now() / 1000) + ttl;
        const allowed = currentCount <= limit;
        const remaining = allowed ? limit - currentCount : 0;

        logger.info('Fixed window check', {
            key, currentCount, limit, allowed, remaining, ttl,
        });

        return { allowed, remaining, resetAt, limit, windowSeconds, algorithm: 'fixed-window' };
    } catch (err) {
        logger.error('Fixed window check failed — allowing request (fail-open)', {
            error: err.message, identifier, endpoint,
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
 * Delete the counter key to reset a user's fixed window limit.
 */
const resetLimit = async (identifier, endpoint) => {
    const key = generateKey(identifier, endpoint);
    try {
        const result = await redisClient.del(key);
        logger.info('Fixed window reset', { key, existed: result === 1 });
        return result === 1;
    } catch (err) {
        logger.error('Failed to reset fixed window', { error: err.message, key });
        return false;
    }
};

module.exports = { generateKey, checkFixedWindow, resetLimit };
