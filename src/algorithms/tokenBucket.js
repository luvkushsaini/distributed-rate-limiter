const { redisClient } = require('../store/redisClient')
const logger = require('../utils/logger')


const generateKey = (identifier, endpoint) => {
    return `token_bucket:${identifier}:${endpoint}`;
};

/**
 * Check if a request is allowed under the token bucket rate limit.
 * Refills tokens based on elapsed time, then consumes one if available.
 */
const checkTokenBucket = async (identifier, endpoint, config) => {
    const { capacity, refillRate } = config;
    const key = generateKey(identifier, endpoint);
    const now = Date.now();


    try {
        const data = await redisClient.hGetAll(key);
        let tokens;
        let lastRefillTime;

        if (!data || !data.tokens) { //First request ever — start with full bucket
            tokens = capacity;
            lastRefillTime = now;

        }
        else {
            lastRefillTime = parseFloat(data.lastRefillTime);
            const previousToken = parseFloat(data.tokens);
            const timePassed = (now - lastRefillTime) / 1000;
            const newTokens = timePassed * refillRate;

            tokens = Math.min(previousToken + newTokens, capacity);

        }
        const allowed = tokens >= 1;
        if (allowed) {
            tokens -= 1;
        }

        await redisClient.hSet(key, {
            tokens: tokens.toString(),
            lastRefillTime: now.toString()
        });

        await redisClient.expire(key, Math.ceil(capacity / refillRate) * 2);

        const remaining = Math.floor(tokens);
        const resetAt = allowed ? Math.floor(now / 1000) : Math.floor(now / 1000 + (1 - tokens) / refillRate);
        logger.info('Token bucket check', {
            key,
            tokens: tokens.toFixed(2),
            allowed,
            remaining,
        });

        return {
            allowed,
            remaining,
            resetAt,
            limit: capacity,
            windowSeconds: Math.ceil(capacity / refillRate),
            algorithm: 'token-bucket',
        };
    } catch (err) {
        logger.error('Token bucket check failed -allowing request (fail-open)', {
            error: err.message,
            identifier,
            endpoint,
        });

        return {
            allowed: true,
            remaining: capacity,
            resetAt: Math.floor(Date.now() / 1000),
            limit: capacity,
            windowSeconds: Math.ceil(capacity / refillRate),
            algorithm: 'token-bucket',
        };
    }

};

/**
 * Delete the hash key to reset a user's token bucket
 */
const resetLimit = async (identifier, endpoint) => {
    const key = generateKey(identifier, endpoint);

    try {
        const result = await redisClient.del(key);

        logger.info('Token bucket reset', {
            key,
            existed: result === 1,
        });

        return result === 1;

    } catch (err) {
        logger.error('Failed to reset token bucket', {
            error: err.message,
            key,
        });
        return false;
    }
};

module.exports = { generateKey, checkTokenBucket, resetLimit };