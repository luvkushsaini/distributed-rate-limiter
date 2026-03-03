jest.mock('../src/store/redisClient', () => {
    const mockRedis = {
        incr: jest.fn(),
        expire: jest.fn(),
        ttl: jest.fn(),
        del: jest.fn(),
        eval: jest.fn(),
        hgetall: jest.fn(),
        hset: jest.fn(),
        connect: jest.fn().mockResolvedValue(true),
        status: 'ready',
        on: jest.fn(),
    };
    return {
        redis: mockRedis,
        connectRedis: jest.fn().mockResolvedValue(true),
        isRedisConnected: jest.fn().mockReturnValue(true),
    };
});

jest.mock('../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
}));

jest.mock('../src/db', () => ({
    query: jest.fn().mockResolvedValue({ rows: [] }),
}));

const request = require('supertest');
const { redis } = require('../src/store/redisClient');
const app = require('../src/index');

describe('Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        redis.incr.mockResolvedValue(1);
        redis.expire.mockResolvedValue(true);
        redis.ttl.mockResolvedValue(60);
        redis.del.mockResolvedValue(1);
    });

    test('GET /api/health should return 200 with correct shape', async () => {
        const response = await request(app).get('/api/health');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('redis');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body.status).toBe('ok');
    });

    test('POST /api/check should return correct response shape', async () => {
        redis.eval.mockResolvedValue([1, 1]);

        const response = await request(app)
            .post('/api/check')
            .send({ identifier: 'testuser', algorithm: 'sliding', limit: 10, windowMs: 60000 });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('allowed');
        expect(response.body).toHaveProperty('remaining');
        expect(response.body).toHaveProperty('resetAt');
        expect(response.body).toHaveProperty('limit');
        expect(response.body).toHaveProperty('windowSeconds');
        expect(response.body).toHaveProperty('algorithm');
        expect(response.body.algorithm).toBe('sliding-window');
    });

    test('POST /api/check should return 400 when identifier missing', async () => {
        const response = await request(app)
            .post('/api/check')
            .send({ algorithm: 'sliding', limit: 10, windowMs: 60000 });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('identifier is required');
    });

    test('POST /api/check with fixed algorithm should work', async () => {
        redis.incr.mockResolvedValue(1);
        redis.expire.mockResolvedValue(true);
        redis.ttl.mockResolvedValue(60);

        const response = await request(app)
            .post('/api/check')
            .send({ identifier: 'testuser', algorithm: 'fixed', limit: 10, windowMs: 60000 });

        expect(response.status).toBe(200);
        expect(response.body.allowed).toBe(true);
        expect(response.body.algorithm).toBe('fixed-window');
    });

    test('GET /api/rules should return rules array', async () => {
        const response = await request(app).get('/api/rules');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });
});
