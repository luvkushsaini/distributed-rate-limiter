/**
 * Fixed Window Rate Limiting Algorithm
 *
 * How it works:
 * - Time is divided into fixed windows (e.g., 60-second blocks)
 * - Each window has a counter that tracks the number of requests
 * - When a request comes in, the counter is atomically incremented
 * - If the counter exceeds the limit, the request is rejected
 * - When the window expires, the counter resets to 0 automatically (via Redis TTL)
 *
 * Why INCR instead of GET-then-SET:
 * - INCR is atomic — two concurrent requests cannot read the same value
 * - GET-then-SET has a race condition: both threads read count=99, both write count=100,
 *   and a 101st request sneaks through because the second thread didn't see the first's write
 * - INCR guarantees each request gets a unique, sequential counter value
 */
const { redisClient } = require('../store/redisClient');
const logger = require('../utils/logger');

/**
 * Generate a Redis key for the fixed window counter
 * Format: "fixed:{identifier}:{endpoint}"
 *
 * @param {string} identifier - The user ID, IP address, or API key
 * @param {string} endpoint - The API endpoint being rate limited
 * @returns {string} The Redis key for this identifier+endpoint combination
 *
 * @example
 * generateKey("user123", "/api/search") → "fixed:user123:/api/search"
 */
const generateKey = (identifier, endpoint) => {
    return `fixed:${identifier}:${endpoint}`;
};

/**
 * Check if a request is allowed under the fixed window rate limit
 *
 * Algorithm steps:
 * 1. INCR the Redis key (atomic increment, returns new count)
 * 2. If count === 1, this is the first request in the window → set EXPIRE
 * 3. GET the TTL to calculate when the window resets
 * 4. Compare count against limit to decide allow/deny
 *
 * Fail-open strategy: if Redis is down, allow the request through.
 * Availability is more important than perfect rate limiting.
 *
 * @param {string} identifier - The user ID, IP address, or API key
 * @param {string} endpoint - The API endpoint being accessed
 * @param {Object} config - Rate limit configuration
 * @param {number} config.limit - Maximum number of requests allowed per window
 * @param {number} config.windowSeconds - Window duration in seconds
 * @returns {Promise<Object>} Rate limit result with allowed, remaining, resetAt, etc.
 *
 * @example
 * const result = await checkFixedWindow("user123", "/api/search", { limit: 100, windowSeconds: 60 });
 * // { allowed: true, remaining: 99, resetAt: 1709123456, limit: 100, windowSeconds: 60, algorithm: "fixed-window" }
 */
const checkFixedWindow = async (identifier, endpoint, config) => {
    const { limit, windowSeconds } = config;
    const key = generateKey(identifier, endpoint);

    try {
        // Step 1: Atomically increment the counter
        // INCR returns the NEW value after incrementing
        // If the key doesn't exist, Redis creates it with value 0, then increments to 1
        const currentCount = await redisClient.incr(key);

        // Step 2: If this is the first request in the window, start the timer
        // We only set EXPIRE when count === 1 to avoid resetting the window mid-flight
        if (currentCount === 1) {
            await redisClient.expire(key, windowSeconds);
        }

        // Step 3: Get the TTL to calculate resetAt
        // TTL returns seconds remaining until the key expires
        const ttl = await redisClient.ttl(key);

        // Calculate the Unix timestamp when this window resets
        const resetAt = Math.floor(Date.now() / 1000) + ttl;

        // Step 4: Determine if the request is allowed
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
        // FAIL-OPEN: If Redis is down, allow the request through
        // Log the error so we know something is wrong, but don't block the user
        logger.error('Fixed window rate limit check failed — allowing request (fail-open)', {
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
 * Deletes the Redis key, effectively resetting the window
 *
 * Used for:
 * - Testing: clean up between test runs
 * - Admin operations: manually reset a user's rate limit
 *
 * @param {string} identifier - The user ID, IP address, or API key
 * @param {string} endpoint - The API endpoint
 * @returns {Promise<boolean>} true if the key existed and was deleted, false if it didn't exist
 */
const resetLimit = async (identifier, endpoint) => {
    const key = generateKey(identifier, endpoint);

    try {
        // DEL returns the number of keys deleted (0 or 1)
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
