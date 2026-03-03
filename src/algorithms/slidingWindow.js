const { redis } = require('../store/redisClient');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

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
 * @returns {string} Redis key scoped to identifier + endpoint
 */
const generateKey = (identifier, endpoint) => {
    return `sliding:${identifier}:${endpoint}`;
};

/**
 * @description Checks if a request is allowed under the sliding window limit using a Lua script
 */
const checkSlidingWindow = async (identifier, endpoint, config) => {
    const { limit, windowSeconds } = config;
    const key = generateKey(identifier, endpoint);
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const uniqueMember = uuidv4();

    try {
        const result = await redis.eval(
            LUA_SLIDING_WINDOW,
            1,
            key,
            String(windowStart),
            String(now),
            uniqueMember,
            String(limit),
            String(windowSeconds)
        );

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
 * @description Deletes the sorted set key to reset a user's sliding window counter
 */
const resetLimit = async (identifier, endpoint) => {
    const key = generateKey(identifier, endpoint);
    try {
        const result = await redis.del(key);
        logger.info('Sliding window reset', { key, existed: result === 1 });
        return result === 1;
    } catch (err) {
        logger.error('Failed to reset sliding window', { error: err.message, key });
        return false;
    }
};

module.exports = { generateKey, checkSlidingWindow, resetLimit };