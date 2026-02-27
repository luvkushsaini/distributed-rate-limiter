/**
 * Integration tests for the full request flow
 * Tests the complete path: HTTP request → middleware → route handler → response
 *
 * Uses supertest to make real HTTP requests to the Express app
 * Mocks Redis so we don't need a real Redis connection
 */

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

const request = require('supertest');
const { redisClient } = require('../src/store/redisClient');

// We need to require the app AFTER mocking Redis so the app uses the mock
const app = require('../src/index');

describe('Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default mock behavior: allow all requests
        redisClient.incr.mockResolvedValue(1);
        redisClient.expire.mockResolvedValue(true);
        redisClient.ttl.mockResolvedValue(60);
        redisClient.del.mockResolvedValue(1);
    });

    // -------------------------------------------------------
    // TEST 1: GET /health should return 200 with correct shape
    // -------------------------------------------------------
    test('GET /health should return 200 with correct shape', async () => {
        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('environment');
        expect(response.body).toHaveProperty('services');
        expect(response.body.services).toHaveProperty('redis');
        expect(response.body.status).toBe('ok');
    });

    // -------------------------------------------------------
    // TEST 2: POST /api/check-rate-limit should return correct response shape
    // -------------------------------------------------------
    test('POST /api/check-rate-limit should return correct response shape', async () => {
        const response = await request(app)
            .post('/api/check-rate-limit')
            .send({ userId: 'testuser', endpoint: '/api/search' });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('allowed');
        expect(response.body).toHaveProperty('remaining');
        expect(response.body).toHaveProperty('resetAt');
        expect(response.body).toHaveProperty('limit');
        expect(response.body).toHaveProperty('windowSeconds');
        expect(response.body).toHaveProperty('algorithm');
        expect(response.body.algorithm).toBe('fixed-window');
    });

    // -------------------------------------------------------
    // TEST 3: POST /api/check-rate-limit should return 400 when userId missing
    // -------------------------------------------------------
    test('POST /api/check-rate-limit should return 400 when userId missing', async () => {
        const response = await request(app)
            .post('/api/check-rate-limit')
            .send({ endpoint: '/api/search' });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('required');
    });

    // -------------------------------------------------------
    // TEST 4: POST /api/check-rate-limit should return 400 when endpoint missing
    // -------------------------------------------------------
    test('POST /api/check-rate-limit should return 400 when endpoint missing', async () => {
        const response = await request(app)
            .post('/api/check-rate-limit')
            .send({ userId: 'testuser' });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('required');
    });

    // -------------------------------------------------------
    // TEST 5: GET /api/limit-config should return the rate limit configuration
    // -------------------------------------------------------
    test('GET /api/limit-config should return the rate limit configuration', async () => {
        const response = await request(app).get('/api/limit-config');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('default');
        expect(response.body).toHaveProperty('endpoints');
        expect(response.body.default).toHaveProperty('limit');
        expect(response.body.default).toHaveProperty('windowSeconds');
    });
});
