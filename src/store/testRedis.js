const { redis, connectRedis } = require('./redisClient');
const logger = require('../utils/logger');

const testRedis = async () => {
    try {
        await connectRedis();
        logger.info('Testing Redis operations...');

        await redis.set('test:connection', 'hello from rate limiter');
        logger.info('Test 1 passed: SET operation successful');

        const value = await redis.get('test:connection');
        logger.info('Test 2 passed: GET operation successful', { value });

        await redis.set('test:expiry', '42', 'EX', 10);
        const ttl = await redis.ttl('test:expiry');
        logger.info('Test 3 passed: SET with expiry successful', { ttl });

        await redis.set('test:counter', '0');
        await redis.incr('test:counter');
        await redis.incr('test:counter');
        await redis.incr('test:counter');
        const counter = await redis.get('test:counter');
        logger.info('Test 4 passed: INCR operation successful', { counter });

        await redis.del('test:connection');
        await redis.del('test:expiry');
        await redis.del('test:counter');
        logger.info('Test 5 passed: DEL operation successful');

        logger.info('All Redis tests passed successfully');
        process.exit(0);
    } catch (err) {
        logger.error('Redis test failed', { error: err.message });
        process.exit(1);
    }
};

testRedis();
