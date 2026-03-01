/**
 * Sliding Window Log — rate limiter using Redis sorted sets + Lua for atomicity.
 * Each request timestamp is stored in a ZSET. Old entries are pruned per window.
 */
const { redisClient } = require('../store/redisClient');
const logger = require('../utils/logger');

/**
 * Lua script that atomically prunes, checks, and conditionally inserts.
 * KEYS[1] = sorted set key
 * ARGV[1] = window start timestamp
 * ARGV[2] = current timestamp (score)
 * ARGV[3] = unique member value
 * ARGV[4] = max allowed requests
 * ARGV[5] = TTL in seconds
 *
 * Returns { currentCount, allowed (0/1) }
 */
const LUA_SLIDING_WINDOW = `
  redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])

  local count = redis.call('ZCARD', KEYS[1])
  local allowed = 0

  if count < tonumber(ARGV[4]) then
    redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
    allowed = 1
    count = count + 1
  end

  redis.call('EXPIRE', KEYS[1], ARGV[5])
  return {count, allowed}
`;

/**
 * Build a Redis key scoped to identifier + endpoint
 */
const generateKey = (identifier, endpoint) => {
    return `sliding:${identifier}:${endpoint}`;
};

/**
 * Check if a request is allowed under the sliding window rate limit.
 * Uses a Lua script so prune → count → insert is a single atomic operation.
 */
const checkSlidingWindow = async (identifier, endpoint, config) => {
    const { limit, windowSeconds } = config;
    const key = generateKey(identifier, endpoint);
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const uniqueMember = `${now}:${Math.random().toString(36).slice(2, 10)}`;

    try {
        const result = await redisClient.eval(LUA_SLIDING_WINDOW, {
            keys: [key],
            arguments: [
                String(windowStart),
                String(now),
                uniqueMember,
                String(limit),
                String(windowSeconds),
            ],
        });

        const currentCount = Number(result[0]);
        const allowed = result[1] === 1;
        const remaining = allowed ? limit - currentCount : 0;
        const resetAt = Math.floor((now + windowSeconds * 1000) / 1000);

        logger.info('Sliding window check', {
            key, currentCount, limit, allowed, remaining,
        });

        return { allowed, remaining, resetAt, limit, windowSeconds, algorithm: 'sliding-window' };
    } catch (err) {
        logger.error('Sliding window failed — fail-open', {
            error: err.message, identifier, endpoint,
        });

        return {
            allowed: true,
            remaining: limit,
            resetAt: Math.floor(Date.now() / 1000) + windowSeconds,
            limit,
            windowSeconds,
            algorithm: 'sliding-window',
        };
    }
};

/**
 * Delete the sorted set key to reset a user's sliding window counter
 */
const resetLimit = async (identifier, endpoint) => {
    const key = generateKey(identifier, endpoint);
    try {
        const result = await redisClient.del(key);
        logger.info('Sliding window reset', { key, existed: result === 1 });
        return result === 1;
    } catch (err) {
        logger.error('Failed to reset sliding window', { error: err.message, key });
        return false;
    }
};

module.exports = { generateKey, checkSlidingWindow, resetLimit };