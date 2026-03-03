jest.mock('../src/store/redisClient', () => {
    const mockRedis = {
        eval: jest.fn(),
        del: jest.fn(),
    };
    return { redis: mockRedis };
});

jest.mock('../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
}));

const { generateKey, checkSlidingWindow, resetLimit } = require('../src/algorithms/slidingWindow');
const { redis } = require('../src/store/redisClient');

describe('Sliding Window Algorithm', () => {
    const defaultConfig = { limit: 10, windowSeconds: 60 };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should allow first request', async () => {
        redis.eval.mockResolvedValue([1, 1]);

        const result = await checkSlidingWindow('user1', '/api/test', defaultConfig);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(9);
        expect(result.algorithm).toBe('sliding-window');
    });

    test('should decrement remaining on each request', async () => {
        redis.eval.mockResolvedValueOnce([1, 1]);
        const result1 = await checkSlidingWindow('user1', '/api/test', defaultConfig);

        redis.eval.mockResolvedValueOnce([2, 1]);
        const result2 = await checkSlidingWindow('user1', '/api/test', defaultConfig);

        redis.eval.mockResolvedValueOnce([3, 1]);
        const result3 = await checkSlidingWindow('user1', '/api/test', defaultConfig);

        expect(result1.remaining).toBe(9);
        expect(result2.remaining).toBe(8);
        expect(result3.remaining).toBe(7);
    });

    test('should block request when limit is exceeded', async () => {
        const strictConfig = { limit: 3, windowSeconds: 60 };

        redis.eval.mockResolvedValueOnce([1, 1]);
        const r1 = await checkSlidingWindow('user1', '/api/test', strictConfig);

        redis.eval.mockResolvedValueOnce([2, 1]);
        const r2 = await checkSlidingWindow('user1', '/api/test', strictConfig);

        redis.eval.mockResolvedValueOnce([3, 1]);
        const r3 = await checkSlidingWindow('user1', '/api/test', strictConfig);

        redis.eval.mockResolvedValueOnce([3, 0]);
        const r4 = await checkSlidingWindow('user1', '/api/test', strictConfig);

        expect(r1.allowed).toBe(true);
        expect(r2.allowed).toBe(true);
        expect(r3.allowed).toBe(true);
        expect(r4.allowed).toBe(false);
        expect(r4.remaining).toBe(0);
    });

    test('should allow requests from different identifiers independently', async () => {
        const strictConfig = { limit: 2, windowSeconds: 60 };

        redis.eval.mockResolvedValueOnce([1, 1]);
        await checkSlidingWindow('user1', '/api/test', strictConfig);

        redis.eval.mockResolvedValueOnce([2, 1]);
        await checkSlidingWindow('user1', '/api/test', strictConfig);

        redis.eval.mockResolvedValueOnce([2, 0]);
        const user1Blocked = await checkSlidingWindow('user1', '/api/test', strictConfig);

        redis.eval.mockResolvedValueOnce([1, 1]);
        const user2First = await checkSlidingWindow('user2', '/api/test', strictConfig);

        expect(user1Blocked.allowed).toBe(false);
        expect(user2First.allowed).toBe(true);
        expect(user2First.remaining).toBe(1);
    });

    test('should return correct resetAt timestamp', async () => {
        redis.eval.mockResolvedValue([1, 1]);

        const beforeTimestamp = Math.floor(Date.now() / 1000);
        const result = await checkSlidingWindow('user1', '/api/test', defaultConfig);

        expect(typeof result.resetAt).toBe('number');
        expect(result.resetAt).toBeGreaterThanOrEqual(beforeTimestamp + 59);
        expect(result.resetAt).toBeLessThanOrEqual(beforeTimestamp + 61);
    });

    test('should return allowed:true if Redis fails (fail-open)', async () => {
        redis.eval.mockRejectedValue(new Error('Redis connection refused'));

        const result = await checkSlidingWindow('user1', '/api/test', defaultConfig);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(10);
        expect(result.algorithm).toBe('sliding-window');
    });

    test('should handle exactly at the limit boundary', async () => {
        const boundaryConfig = { limit: 5, windowSeconds: 60 };

        for (let i = 1; i <= 4; i++) {
            redis.eval.mockResolvedValueOnce([i, 1]);
            await checkSlidingWindow('user1', '/api/test', boundaryConfig);
        }

        redis.eval.mockResolvedValueOnce([5, 1]);
        const result5 = await checkSlidingWindow('user1', '/api/test', boundaryConfig);

        redis.eval.mockResolvedValueOnce([5, 0]);
        const result6 = await checkSlidingWindow('user1', '/api/test', boundaryConfig);

        expect(result5.allowed).toBe(true);
        expect(result5.remaining).toBe(0);
        expect(result6.allowed).toBe(false);
        expect(result6.remaining).toBe(0);
    });

    test('should use correct key format', () => {
        expect(generateKey('user123', '/api/search')).toBe('sliding:user123:/api/search');
        expect(generateKey('192.168.1.1', '/health')).toBe('sliding:192.168.1.1:/health');
    });

    test('should reset limit successfully', async () => {
        redis.del.mockResolvedValue(1);
        const result = await resetLimit('user1', '/api/test');
        expect(result).toBe(true);
        expect(redis.del).toHaveBeenCalledWith('sliding:user1:/api/test');
    });

    test('should return false on reset when key does not exist', async () => {
        redis.del.mockResolvedValue(0);
        const result = await resetLimit('user1', '/api/nonexistent');
        expect(result).toBe(false);
    });

    test('should handle different endpoints independently', async () => {
        const searchConfig = { limit: 30, windowSeconds: 60 };
        const dataConfig = { limit: 100, windowSeconds: 60 };

        redis.eval.mockResolvedValueOnce([1, 1]);
        await checkSlidingWindow('user1', '/api/search', searchConfig);
        redis.eval.mockResolvedValueOnce([2, 1]);
        await checkSlidingWindow('user1', '/api/search', searchConfig);
        redis.eval.mockResolvedValueOnce([3, 1]);
        const searchResult = await checkSlidingWindow('user1', '/api/search', searchConfig);

        redis.eval.mockResolvedValueOnce([1, 1]);
        await checkSlidingWindow('user1', '/api/data', dataConfig);
        redis.eval.mockResolvedValueOnce([2, 1]);
        await checkSlidingWindow('user1', '/api/data', dataConfig);
        redis.eval.mockResolvedValueOnce([3, 1]);
        const dataResult = await checkSlidingWindow('user1', '/api/data', dataConfig);

        expect(searchResult.remaining).toBe(27);
        expect(dataResult.remaining).toBe(97);
    });
});
