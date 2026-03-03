const express = require('express');

jest.mock('../src/store/redisClient', () => {
    const mockRedis = {
        incr: jest.fn(),
        expire: jest.fn(),
        ttl: jest.fn(),
        del: jest.fn(),
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

jest.mock('../src/algorithms/fixedWindow', () => ({
    checkFixedWindow: jest.fn(),
    resetLimit: jest.fn(),
}));

const { checkFixedWindow } = require('../src/algorithms/fixedWindow');
const rateLimitMiddleware = require('../src/middleware/rateLimitMiddleware');

const createTestApp = () => {
    const app = express();
    app.use(express.json());
    app.use(rateLimitMiddleware);

    app.get('/test', (req, res) => {
        res.status(200).json({ message: 'success' });
    });

    app.post('/api/check', (req, res) => {
        res.status(200).json({ message: 'check endpoint' });
    });

    return app;
};

const request = require('supertest');

describe('Rate Limit Middleware', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should add rate limit headers to every response', async () => {
        checkFixedWindow.mockResolvedValue({
            allowed: true,
            remaining: 99,
            resetAt: Math.floor(Date.now() / 1000) + 60,
            limit: 100,
            windowSeconds: 60,
            algorithm: 'fixed-window',
        });

        const app = createTestApp();
        const response = await request(app).get('/test');

        expect(response.headers['x-ratelimit-limit']).toBe('100');
        expect(response.headers['x-ratelimit-remaining']).toBe('99');
        expect(response.headers['x-ratelimit-reset']).toBeDefined();
        expect(response.headers['x-ratelimit-algorithm']).toBe('fixed-window');
        expect(response.status).toBe(200);
    });

    test('should return 429 when limit is exceeded', async () => {
        const resetAt = Math.floor(Date.now() / 1000) + 45;

        checkFixedWindow.mockResolvedValue({
            allowed: false,
            remaining: 0,
            resetAt,
            limit: 100,
            windowSeconds: 60,
            algorithm: 'fixed-window',
        });

        const app = createTestApp();
        const response = await request(app).get('/test');

        expect(response.status).toBe(429);
        expect(response.body.error).toBe('Too Many Requests');
        expect(response.body.remaining).toBe(0);
        expect(response.body.resetAt).toBe(resetAt);
        expect(response.body.retryAfter).toBeDefined();
    });

    test('should extract identifier from x-api-key header', async () => {
        checkFixedWindow.mockResolvedValue({
            allowed: true,
            remaining: 99,
            resetAt: Math.floor(Date.now() / 1000) + 60,
            limit: 100,
            windowSeconds: 60,
            algorithm: 'fixed-window',
        });

        const app = createTestApp();
        await request(app).get('/test').set('x-api-key', 'test-key-123');

        expect(checkFixedWindow).toHaveBeenCalledWith(
            'test-key-123',
            '/test',
            expect.any(Object)
        );
    });

    test('should extract identifier from x-user-id header when no api key', async () => {
        checkFixedWindow.mockResolvedValue({
            allowed: true,
            remaining: 99,
            resetAt: Math.floor(Date.now() / 1000) + 60,
            limit: 100,
            windowSeconds: 60,
            algorithm: 'fixed-window',
        });

        const app = createTestApp();
        await request(app).get('/test').set('x-user-id', 'user456');

        expect(checkFixedWindow).toHaveBeenCalledWith(
            'user456',
            '/test',
            expect.any(Object)
        );
    });

    test('should fall back to IP address when no headers', async () => {
        checkFixedWindow.mockResolvedValue({
            allowed: true,
            remaining: 99,
            resetAt: Math.floor(Date.now() / 1000) + 60,
            limit: 100,
            windowSeconds: 60,
            algorithm: 'fixed-window',
        });

        const app = createTestApp();
        await request(app).get('/test');

        expect(checkFixedWindow).toHaveBeenCalledWith(
            expect.any(String),
            '/test',
            expect.any(Object)
        );

        const calledIdentifier = checkFixedWindow.mock.calls[0][0];
        expect(calledIdentifier).not.toBe('test-key-123');
        expect(calledIdentifier).not.toBe('user456');
    });
});
