/**
 * Unit tests for the rate limiting middleware
 *
 * Uses supertest to make HTTP requests to the Express app
 * Mocks the Redis client and fixedWindow algorithm to test middleware behavior
 */
const express = require('express');

// Mock the Redis client
jest.mock('../src/store/redisClient', () => {
    const mockRedisClient = {
        incr: jest.fn(),
        expire: jest.fn(),
        ttl: jest.fn(),
        del: jest.fn(),
        connect: jest.fn().mockResolvedValue(true),
        isReady: true,
        on: jest.fn(),
    };
    return {
        redisClient: mockRedisClient,
        connectRedis: jest.fn().mockResolvedValue(true),
        isRedisConnected: jest.fn().mockReturnValue(true),
    };
});

// Mock the logger to keep test output clean
jest.mock('../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
}));

// Mock checkFixedWindow so we can control its return value per test
jest.mock('../src/algorithms/fixedWindow', () => ({
    checkFixedWindow: jest.fn(),
    resetLimit: jest.fn(),
}));

const { checkFixedWindow } = require('../src/algorithms/fixedWindow');
const rateLimitMiddleware = require('../src/middleware/rateLimitMiddleware');

/**
 * Create a fresh Express app for each test with the middleware applied
 * This avoids state leaking between tests
 */
const createTestApp = () => {
    const app = express();
    app.use(express.json());
    app.use(rateLimitMiddleware);

    // Simple test route
    app.get('/test', (req, res) => {
        res.status(200).json({ message: 'success' });
    });

    app.post('/api/check-rate-limit', (req, res) => {
        res.status(200).json({ message: 'check endpoint' });
    });

    return app;
};

// We use supertest inline instead of requiring it at the top
// so the mock setup happens first
const request = require('supertest');

describe('Rate Limit Middleware', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // -------------------------------------------------------
    // TEST 1: Should add rate limit headers to every response
    // -------------------------------------------------------
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

    // -------------------------------------------------------
    // TEST 2: Should return 429 when limit is exceeded
    // -------------------------------------------------------
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

    // -------------------------------------------------------
    // TEST 3: Should extract identifier from x-api-key header
    // -------------------------------------------------------
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

        // checkFixedWindow should have been called with "test-key-123" as the identifier
        expect(checkFixedWindow).toHaveBeenCalledWith(
            'test-key-123',
            '/test',
            expect.any(Object)
        );
    });

    // -------------------------------------------------------
    // TEST 4: Should extract identifier from x-user-id when no api key
    // -------------------------------------------------------
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

        // checkFixedWindow should have been called with "user456" as the identifier
        expect(checkFixedWindow).toHaveBeenCalledWith(
            'user456',
            '/test',
            expect.any(Object)
        );
    });

    // -------------------------------------------------------
    // TEST 5: Should fall back to IP address when no headers
    // -------------------------------------------------------
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

        // checkFixedWindow should have been called with an IP-like identifier
        // In supertest, req.ip is typically "::ffff:127.0.0.1" or "127.0.0.1"
        expect(checkFixedWindow).toHaveBeenCalledWith(
            expect.any(String),
            '/test',
            expect.any(Object)
        );

        // Verify no api-key or user-id was used — the identifier should be an IP
        const calledIdentifier = checkFixedWindow.mock.calls[0][0];
        expect(calledIdentifier).not.toBe('test-key-123');
        expect(calledIdentifier).not.toBe('user456');
    });
});
