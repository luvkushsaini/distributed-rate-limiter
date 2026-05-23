const { redis } = require('../store/redisClient');
const logger = require('../utils/logger');

/**
 * @returns {string} Redis key for the fixed window counter
 */
const generateKey = (identifier, endpoint) => {
    return `fixed:${identifier}:${endpoint}`;
};

/**
 * @description Checks if a request is allowed under the fixed window limit
 */
const checkFixedWindow = async (identifier, endpoint, config) => {
    const { limit, windowSeconds } = config;
    const key = generateKey(identifier, endpoint);

    try {
        const currentCount = await redis.incr(key);

        if (currentCount === 1) {
            await redis.expire(key, windowSeconds);
        }

        const ttl = await redis.ttl(key);
        const resetAt = Math.floor(Date.now() / 1000) + ttl;
        const allowed = currentCount <= limit;
        const remaining = allowed ? limit - currentCount : 0;

        logger.info('Fixed window check', {
            key, currentCount, limit, allowed, remaining, ttl,
        });

        return { allowed, remaining, resetAt, limit, windowSeconds, algorithm: 'fixed-window' };
    } catch (err) {
        logger.error('Fixed window check failed — fail-open', {
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
 * @description Deletes the counter key to reset a user's fixed window limit
 */
const resetLimit = async (identifier, endpoint) => {
    const key = generateKey(identifier, endpoint);
    try {
        const result = await redis.del(key);
        logger.info('Fixed window reset', { key, existed: result === 1 });
        return result === 1;
    } catch (err) {
        logger.error('Failed to reset fixed window', { error: err.message, key });
        return false;
    }
};

module.exports = { generateKey, checkFixedWindow, resetLimit };
