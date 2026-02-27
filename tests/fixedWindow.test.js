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

    // -------------------------------------------------------
    // TEST 7: Should handle exactly at the limit boundary
    // Verifies: The Nth request (where N = limit) should still be ALLOWED
    // Only the (N+1)th request should be blocked
    // -------------------------------------------------------
    test('should handle exactly at the limit boundary', async () => {
        const boundaryConfig = { limit: 5, windowSeconds: 60 };
        redisClient.ttl.mockResolvedValue(45);
        redisClient.expire.mockResolvedValue(true);

        // Make exactly 5 requests (the limit)
        redisClient.incr.mockResolvedValueOnce(1);
        await checkFixedWindow('user1', '/api/test', boundaryConfig);

        redisClient.incr.mockResolvedValueOnce(2);
        await checkFixedWindow('user1', '/api/test', boundaryConfig);

        redisClient.incr.mockResolvedValueOnce(3);
        await checkFixedWindow('user1', '/api/test', boundaryConfig);

        redisClient.incr.mockResolvedValueOnce(4);
        await checkFixedWindow('user1', '/api/test', boundaryConfig);

        // 5th request — exactly at limit, should still be ALLOWED with remaining: 0
        redisClient.incr.mockResolvedValueOnce(5);
        const result5 = await checkFixedWindow('user1', '/api/test', boundaryConfig);

        expect(result5.allowed).toBe(true);
        expect(result5.remaining).toBe(0);

        // 6th request — over limit, should be BLOCKED
        redisClient.incr.mockResolvedValueOnce(6);
        const result6 = await checkFixedWindow('user1', '/api/test', boundaryConfig);

        expect(result6.allowed).toBe(false);
        expect(result6.remaining).toBe(0);
    });

    // -------------------------------------------------------
    // TEST 8: Should use correct key format
    // Verifies: generateKey produces the exact "fixed:{id}:{endpoint}" format
    // This matters because keys must be consistent for Redis lookups
    // -------------------------------------------------------
    test('should use correct key format', () => {
        const key1 = generateKey('user123', '/api/search');
        expect(key1).toBe('fixed:user123:/api/search');

        const key2 = generateKey('192.168.1.1', '/health');
        expect(key2).toBe('fixed:192.168.1.1:/health');
    });

    // -------------------------------------------------------
    // TEST 9: Should reset limit successfully
    // Verifies: After resetting, the counter starts fresh
    // This is what admins use to unblock a user manually
    // -------------------------------------------------------
    test('should reset limit successfully', async () => {
        redisClient.ttl.mockResolvedValue(60);
        redisClient.expire.mockResolvedValue(true);

        // Make 3 requests to build up a counter
        redisClient.incr.mockResolvedValueOnce(1);
        await checkFixedWindow('user1', '/api/test', defaultConfig);

        redisClient.incr.mockResolvedValueOnce(2);
        await checkFixedWindow('user1', '/api/test', defaultConfig);

        redisClient.incr.mockResolvedValueOnce(3);
        await checkFixedWindow('user1', '/api/test', defaultConfig);

        // Reset the limit
        redisClient.del.mockResolvedValue(1);
        const resetResult = await resetLimit('user1', '/api/test');
        expect(resetResult).toBe(true);

        // After reset, next request should be like the first request again
        redisClient.incr.mockResolvedValueOnce(1);
        const freshResult = await checkFixedWindow('user1', '/api/test', defaultConfig);

        expect(freshResult.allowed).toBe(true);
        expect(freshResult.remaining).toBe(9);
    });

    // -------------------------------------------------------
    // TEST 10: Should handle different endpoints independently
    // Verifies: Each endpoint has its own counter per user
    // user1 hitting /api/search should not affect user1 on /api/data
    // -------------------------------------------------------
    test('should handle different endpoints independently', async () => {
        const searchConfig = { limit: 30, windowSeconds: 60 };
        const dataConfig = { limit: 100, windowSeconds: 60 };
        redisClient.ttl.mockResolvedValue(55);
        redisClient.expire.mockResolvedValue(true);

        // user1 makes 3 requests to /api/search (limit 30)
        redisClient.incr.mockResolvedValueOnce(1);
        await checkFixedWindow('user1', '/api/search', searchConfig);

        redisClient.incr.mockResolvedValueOnce(2);
        await checkFixedWindow('user1', '/api/search', searchConfig);

        redisClient.incr.mockResolvedValueOnce(3);
        const searchResult = await checkFixedWindow('user1', '/api/search', searchConfig);

        // user1 makes 3 requests to /api/data (limit 100)
        redisClient.incr.mockResolvedValueOnce(1);
        await checkFixedWindow('user1', '/api/data', dataConfig);

        redisClient.incr.mockResolvedValueOnce(2);
        await checkFixedWindow('user1', '/api/data', dataConfig);

        redisClient.incr.mockResolvedValueOnce(3);
        const dataResult = await checkFixedWindow('user1', '/api/data', dataConfig);

        // Each endpoint has independent counters
        expect(searchResult.remaining).toBe(27);  // 30 - 3
        expect(dataResult.remaining).toBe(97);     // 100 - 3
    });
});
