/**
 * Redis connection test script
 * Run this manually to verify Redis is working correctly
 * Usage: node src/store/testRedis.js
 */
const { redisClient, connectRedis } = require('./redisClient');
const logger = require('../utils/logger');

const testRedis = async () => {
    try {
        // Connect to Redis
        await connectRedis();
        logger.info('Testing Redis operations...');

        // Test 1: SET a key
        await redisClient.set('test:connection', 'hello from rate limiter');
        logger.info('Test 1 passed: SET operation successful');

        // Test 2: GET the key back
        const value = await redisClient.get('test:connection');
        logger.info('Test 2 passed: GET operation successful', { value });

        // Test 3: SET a key with expiry (this is how rate limiting works)
        await redisClient.set('test:expiry', '42', { EX: 10 });
        const ttl = await redisClient.ttl('test:expiry');
        logger.info('Test 3 passed: SET with expiry successful', { ttl });

        // Test 4: INCREMENT a counter (core of rate limiting)
        await redisClient.set('test:counter', '0');
        await redisClient.incr('test:counter');
        await redisClient.incr('test:counter');
        await redisClient.incr('test:counter');
        const counter = await redisClient.get('test:counter');
        logger.info('Test 4 passed: INCR operation successful', { counter });

        // Test 5: DELETE test keys
        await redisClient.del('test:connection');
        await redisClient.del('test:expiry');
        await redisClient.del('test:counter');
        logger.info('Test 5 passed: DEL operation successful');

        logger.info('All Redis tests passed successfully');
        process.exit(0);
    } catch (err) {
        logger.error('Redis test failed', { error: err.message });
        process.exit(1);
    }
};

testRedis();
