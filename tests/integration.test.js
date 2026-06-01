// integration tests - tests the full request flow through express
jest.mock('../src/store/redisClient', () => ({
    redis: {
        incr:    jest.fn(),
        expire:  jest.fn(),
        ttl:     jest.fn(),
        del:     jest.fn(),
        status:  'ready',
        on:      jest.fn(),
    },
    connectRedis:     jest.fn().mockResolvedValue(true),
    isRedisConnected: jest.fn().mockReturnValue(true),
}));

jest.mock('../src/db/index', () => ({
    query:     jest.fn().mockResolvedValue({ rows: [] }),
    connectDB: jest.fn().mockResolvedValue(true),
}));

jest.mock('../src/events/kafkaProducer', () => ({
    connectKafka:          jest.fn().mockResolvedValue(undefined),
    publishRateLimitEvent: jest.fn().mockResolvedValue(undefined),
    disconnectKafka:       jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/utils/logger', () => ({
    info:  jest.fn(),
    error: jest.fn(),
    warn:  jest.fn(),
}));

const request = require('supertest');
const { redis } = require('../src/store/redisClient');
const { publishRateLimitEvent } = require('../src/events/kafkaProducer');
const app = require('../src/index');

describe('Integration Tests', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        redis.incr.mockResolvedValue(1);
        redis.expire.mockResolvedValue(true);
        redis.ttl.mockResolvedValue(60);
    });

    test('should return 200 on health check', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body).toHaveProperty('redis');
        expect(res.body).toHaveProperty('timestamp');
    });

    test('should allow request when under limit', async () => {
        redis.incr.mockResolvedValue(1);

        const res = await request(app)
            .post('/api/check')
            .send({ identifier: 'user_1', limit: 10, windowMs: 60000 });

        expect(res.status).toBe(200);
        expect(res.body.allowed).toBe(true);
        expect(res.body.algorithm).toBe('fixed-window');
        expect(res.body).toHaveProperty('remaining');
        expect(res.body).toHaveProperty('resetAt');
    });

    test('should block request when limit is exceeded', async () => {
        redis.incr.mockResolvedValue(11);

        const res = await request(app)
            .post('/api/check')
            .send({ identifier: 'user_1', limit: 10, windowMs: 60000 });

        expect(res.status).toBe(200);
        expect(res.body.allowed).toBe(false);
        expect(res.body.remaining).toBe(0);
    });

    test('should return 400 if identifier is missing', async () => {
        const res = await request(app)
            .post('/api/check')
            .send({ limit: 10, windowMs: 60000 });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('identifier is required');
    });

    test('should publish kafka event when request is blocked', async () => {
        redis.incr.mockResolvedValue(11);

        await request(app)
            .post('/api/check')
            .send({ identifier: 'user_kafka', limit: 10, windowMs: 60000 });

        expect(publishRateLimitEvent).toHaveBeenCalledTimes(1);
        expect(publishRateLimitEvent).toHaveBeenCalledWith(
            expect.objectContaining({ identifier: 'user_kafka', allowed: false })
        );
    });

    test('should not publish kafka event when request is allowed', async () => {
        redis.incr.mockResolvedValue(1);

        await request(app)
            .post('/api/check')
            .send({ identifier: 'user_kafka', limit: 10, windowMs: 60000 });

        expect(publishRateLimitEvent).not.toHaveBeenCalled();
    });

    test('should return an array from GET /api/rules', async () => {
        const res = await request(app).get('/api/rules');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});
