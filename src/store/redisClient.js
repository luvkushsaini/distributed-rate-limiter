/**
 * Redis client setup
 *
 * Fail-open strategy: if Redis is down, log the error but do not crash.
 * Availability is more important than perfect rate limiting.
 */
const { createClient } = require('redis');
const { REDIS_URL } = require('../config');
const logger = require('../utils/logger');

const redisClient = createClient({
    url: REDIS_URL,
    socket: {
        // Exponential backoff: 500ms, 1s, 1.5s, ... capped at 3s, max 10 retries
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                logger.error('Redis max reconnection attempts reached');
                return new Error('Max reconnection attempts reached');
            }
            return Math.min(retries * 500, 3000);
        },
    },
});

redisClient.on('error', (err) => {
    logger.error('Redis client error', {
        error: err.message,
        stack: err.stack,
    });
});

redisClient.on('connect', () => {
    logger.info('Redis client connected');
});

redisClient.on('ready', () => {
    logger.info('Redis client ready', { url: REDIS_URL });
});

redisClient.on('end', () => {
    logger.warn('Redis client disconnected');
});

/**
 * Connect to Redis once when the server starts
 * Does not throw — server should start even if Redis is down (fail-open)
 */
const connectRedis = async () => {
    try {
        await redisClient.connect();
        logger.info('Redis connection established successfully');
    } catch (err) {
        logger.error('Failed to connect to Redis on startup', {
            error: err.message,
            url: REDIS_URL,
        });
    }
};

/**
 * Check if Redis is currently connected
 *
 * @returns {boolean} true if Redis is ready to accept commands
 */
const isRedisConnected = () => {
    return redisClient.isReady;
};

module.exports = { redisClient, connectRedis, isRedisConnected };
