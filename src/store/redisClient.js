const Redis = require('ioredis');
const logger = require('../utils/logger');

// retry up to 10 times with increasing delay
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        if (times > 10) {
            logger.error('Redis max reconnection attempts reached');
            return null;
        }
        return Math.min(times * 500, 3000);
    },
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('ready', () => logger.info('Redis ready'));
redis.on('error', (err) => logger.error('Redis error', { error: err.message }));
redis.on('end', () => logger.warn('Redis disconnected'));

// ping redis to make sure the connection works
const connectRedis = async () => {
    try {
        await redis.ping();
        logger.info('Redis connection established successfully');
    } catch (err) {
        logger.error('Failed to connect to Redis', { error: err.message });
    }
};

const isRedisConnected = () => redis.status === 'ready';

module.exports = { redis, connectRedis, isRedisConnected };
