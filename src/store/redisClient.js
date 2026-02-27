/**
 * Redis client setup
 * Creates and exports a Redis client instance
 * Uses fail-open strategy: if Redis is down, log the error but do not crash
 * This means requests will be ALLOWED through if Redis is unavailable
 * This is intentional — availability is more important than perfect rate limiting
 */
const { createClient } = require('redis');
const { REDIS_URL } = require('../config');
const logger = require('../utils/logger');

// Create the Redis client using the URL from config
const redisClient = createClient({
    url: REDIS_URL,
    socket: {
        // Retry connection every 500ms if disconnected
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                logger.error('Redis max reconnection attempts reached');
                return new Error('Max reconnection attempts reached');
            }
            return Math.min(retries * 500, 3000);
        },
    },
});

// Log any Redis errors without crashing the server
redisClient.on('error', (err) => {
    logger.error('Redis client error', {
        error: err.message,
        stack: err.stack,
    });
});

// Log when Redis connects successfully
redisClient.on('connect', () => {
    logger.info('Redis client connected');
});

// Log when Redis is ready to accept commands
redisClient.on('ready', () => {
    logger.info('Redis client ready', { url: REDIS_URL });
});

// Log when Redis disconnects
redisClient.on('end', () => {
    logger.warn('Redis client disconnected');
});

/**
 * Connect to Redis
 * Call this once when the server starts
 * Uses fail-open: logs error but does not throw, so server still starts
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
        // Do NOT throw — server should start even if Redis is down
    }
};

/**
 * Check if Redis is currently connected
 * Used by health check endpoint
 */
const isRedisConnected = () => {
    return redisClient.isReady;
};

module.exports = { redisClient, connectRedis, isRedisConnected };
