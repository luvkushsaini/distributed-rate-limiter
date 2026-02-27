/**
 * Redis client setup
 * Creates and exports a Redis client instance
 * Uses fail-open strategy: if Redis is down, log error but do not crash
 */
const { createClient } = require('redis');
const { REDIS_URL } = require('../config');
const logger = require('../utils/logger');

const redisClient = createClient({
    url: REDIS_URL,
});

// Log any Redis errors without crashing the server
redisClient.on('error', (err) => {
    logger.error('Redis connection error', { error: err.message });
});

// Log successful connection
redisClient.on('connect', () => {
    logger.info('Redis connected successfully');
});

/**
 * Connect to Redis
 * Call this once when the server starts
 */
const connectRedis = async () => {
    try {
        await redisClient.connect();
    } catch (err) {
        logger.error('Failed to connect to Redis', { error: err.message });
    }
};

module.exports = { redisClient, connectRedis };
