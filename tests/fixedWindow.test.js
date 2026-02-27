/**
 * Unit tests for the Fixed Window rate limiting algorithm
 *
 * These tests mock the Redis client so they run without a live Redis instance.
 * Each test verifies a specific behavior of the algorithm.
 */

// Mock the Redis client before importing the algorithm
jest.mock('../src/store/redisClient', () => {
    const mockRedisClient = {
        incr: jest.fn(),
        expire: jest.fn(),
        ttl: jest.fn(),
        del: jest.fn(),
    };
    return {
        redisClient: mockRedisClient,
    };
});

// Mock the logger to keep test output clean
jest.mock('../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
}));

const { generateKey, checkFixedWindow, resetLimit } = require('../src/algorithms/fixedWindow');
const { redisClient } = require('../src/store/redisClient');

describe('Fixed Window Algorithm', () => {
    // Default test config: 10 requests per 60 seconds
    const defaultConfig = { limit: 10, windowSeconds: 60 };

    /**
     * Reset all mocks before each test to ensure test isolation
     */
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // -------------------------------------------------------
    // TEST 1: Should allow the first request
    // -------------------------------------------------------
    test('should allow first request', async () => {
        // INCR returns 1 (first request in window)
        redisClient.incr.mockResolvedValue(1);
        redisClient.expire.mockResolvedValue(true);
        redisClient.ttl.mockResolvedValue(60);

        const result = await checkFixedWindow('user1', '/api/test', defaultConfig);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(9);
        expect(result.algorithm).toBe('fixed-window');

        // EXPIRE should be called because this is the first request (count === 1)
        expect(redisClient.expire).toHaveBeenCalledWith(
            'fixed:user1:/api/test',
            60
        );
    });

    // -------------------------------------------------------
    // TEST 2: Should decrement remaining on each request
    // -------------------------------------------------------
    test('should decrement remaining on each request', async () => {
        redisClient.ttl.mockResolvedValue(55);

        // Simulate 3 sequential requests
        redisClient.incr.mockResolvedValueOnce(1);
        redisClient.expire.mockResolvedValue(true);
        const result1 = await checkFixedWindow('user1', '/api/test', defaultConfig);

        redisClient.incr.mockResolvedValueOnce(2);
        const result2 = await checkFixedWindow('user1', '/api/test', defaultConfig);

        redisClient.incr.mockResolvedValueOnce(3);
        const result3 = await checkFixedWindow('user1', '/api/test', defaultConfig);

        // Remaining should decrease: 9, 8, 7
        expect(result1.remaining).toBe(9);
        expect(result2.remaining).toBe(8);
        expect(result3.remaining).toBe(7);
    });

    // -------------------------------------------------------
    // TEST 3: Should block request when limit is exceeded
    // -------------------------------------------------------
    test('should block request when limit is exceeded', async () => {
        const strictConfig = { limit: 3, windowSeconds: 60 };
        redisClient.ttl.mockResolvedValue(45);
        redisClient.expire.mockResolvedValue(true);

        // Simulate 4 requests with limit of 3
        redisClient.incr.mockResolvedValueOnce(1);
        const result1 = await checkFixedWindow('user1', '/api/test', strictConfig);

        redisClient.incr.mockResolvedValueOnce(2);
        const result2 = await checkFixedWindow('user1', '/api/test', strictConfig);

        redisClient.incr.mockResolvedValueOnce(3);
        const result3 = await checkFixedWindow('user1', '/api/test', strictConfig);

        // 4th request — should be BLOCKED
        redisClient.incr.mockResolvedValueOnce(4);
        const result4 = await checkFixedWindow('user1', '/api/test', strictConfig);

        expect(result1.allowed).toBe(true);
        expect(result2.allowed).toBe(true);
        expect(result3.allowed).toBe(true);
        expect(result4.allowed).toBe(false);
        expect(result4.remaining).toBe(0);
    });

    // -------------------------------------------------------
    // TEST 4: Should allow requests from different identifiers independently
    // -------------------------------------------------------
    test('should allow requests from different identifiers independently', async () => {
        const strictConfig = { limit: 2, windowSeconds: 60 };
        redisClient.ttl.mockResolvedValue(50);
        redisClient.expire.mockResolvedValue(true);

        // user1 makes 2 requests — hits the limit
        redisClient.incr.mockResolvedValueOnce(1);
        await checkFixedWindow('user1', '/api/test', strictConfig);

        redisClient.incr.mockResolvedValueOnce(2);
        await checkFixedWindow('user1', '/api/test', strictConfig);

        // user1 is now at limit — 3rd request should be blocked
        redisClient.incr.mockResolvedValueOnce(3);
        const user1Blocked = await checkFixedWindow('user1', '/api/test', strictConfig);

        // user2 makes their first request — should be completely independent
        redisClient.incr.mockResolvedValueOnce(1);
        const user2First = await checkFixedWindow('user2', '/api/test', strictConfig);

        expect(user1Blocked.allowed).toBe(false);
        expect(user2First.allowed).toBe(true);
        expect(user2First.remaining).toBe(1);
    });

    // -------------------------------------------------------
    // TEST 5: Should return correct resetAt timestamp
    // -------------------------------------------------------
    test('should return correct resetAt timestamp', async () => {
        redisClient.incr.mockResolvedValue(1);
        redisClient.expire.mockResolvedValue(true);
        redisClient.ttl.mockResolvedValue(60);

        const beforeTimestamp = Math.floor(Date.now() / 1000);
        const result = await checkFixedWindow('user1', '/api/test', defaultConfig);

        // resetAt should be in the future (current time + TTL)
        expect(typeof result.resetAt).toBe('number');
        expect(result.resetAt).toBeGreaterThan(beforeTimestamp);
        expect(result.resetAt).toBeLessThanOrEqual(beforeTimestamp + 61);
    });

    // -------------------------------------------------------
    // TEST 6: Should return allowed:true if Redis fails (fail-open)
    // -------------------------------------------------------
    test('should return allowed:true if Redis fails (fail-open)', async () => {
        // Make Redis throw an error
        redisClient.incr.mockRejectedValue(new Error('Redis connection refused'));

        const result = await checkFixedWindow('user1', '/api/test', defaultConfig);

        // FAIL-OPEN: even though Redis is down, the request should be allowed
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(10);
        expect(result.algorithm).toBe('fixed-window');
    });
});
