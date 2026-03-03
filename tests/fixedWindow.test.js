jest.mock('../src/store/redisClient', () => {
    const mockRedis = {
        incr: jest.fn(),
        expire: jest.fn(),
        ttl: jest.fn(),
        del: jest.fn(),
    };
    return { redis: mockRedis };
});

jest.mock('../src/utils/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
}));

const { generateKey, checkFixedWindow, resetLimit } = require('../src/algorithms/fixedWindow');
const { redis } = require('../src/store/redisClient');

describe('Fixed Window Algorithm', () => {
    const defaultConfig = { limit: 10, windowSeconds: 60 };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should allow first request', async () => {
        redis.incr.mockResolvedValue(1);
        redis.expire.mockResolvedValue(true);
        redis.ttl.mockResolvedValue(60);

        const result = await checkFixedWindow('user1', '/api/test', defaultConfig);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(9);
        expect(result.algorithm).toBe('fixed-window');
        expect(redis.expire).toHaveBeenCalledWith('fixed:user1:/api/test', 60);
    });

    test('should decrement remaining on each request', async () => {
        redis.ttl.mockResolvedValue(55);

        redis.incr.mockResolvedValueOnce(1);
        redis.expire.mockResolvedValue(true);
        const result1 = await checkFixedWindow('user1', '/api/test', defaultConfig);

        redis.incr.mockResolvedValueOnce(2);
        const result2 = await checkFixedWindow('user1', '/api/test', defaultConfig);

        redis.incr.mockResolvedValueOnce(3);
        const result3 = await checkFixedWindow('user1', '/api/test', defaultConfig);

        expect(result1.remaining).toBe(9);
        expect(result2.remaining).toBe(8);
        expect(result3.remaining).toBe(7);
    });

    test('should block request when limit is exceeded', async () => {
        const strictConfig = { limit: 3, windowSeconds: 60 };
        redis.ttl.mockResolvedValue(45);
        redis.expire.mockResolvedValue(true);

        redis.incr.mockResolvedValueOnce(1);
        const result1 = await checkFixedWindow('user1', '/api/test', strictConfig);

        redis.incr.mockResolvedValueOnce(2);
        const result2 = await checkFixedWindow('user1', '/api/test', strictConfig);

        redis.incr.mockResolvedValueOnce(3);
        const result3 = await checkFixedWindow('user1', '/api/test', strictConfig);

        redis.incr.mockResolvedValueOnce(4);
        const result4 = await checkFixedWindow('user1', '/api/test', strictConfig);

        expect(result1.allowed).toBe(true);
        expect(result2.allowed).toBe(true);
        expect(result3.allowed).toBe(true);
        expect(result4.allowed).toBe(false);
        expect(result4.remaining).toBe(0);
    });

    test('should allow requests from different identifiers independently', async () => {
        const strictConfig = { limit: 2, windowSeconds: 60 };
        redis.ttl.mockResolvedValue(50);
        redis.expire.mockResolvedValue(true);

        redis.incr.mockResolvedValueOnce(1);
        await checkFixedWindow('user1', '/api/test', strictConfig);

        redis.incr.mockResolvedValueOnce(2);
        await checkFixedWindow('user1', '/api/test', strictConfig);

        redis.incr.mockResolvedValueOnce(3);
        const user1Blocked = await checkFixedWindow('user1', '/api/test', strictConfig);

        redis.incr.mockResolvedValueOnce(1);
        const user2First = await checkFixedWindow('user2', '/api/test', strictConfig);

        expect(user1Blocked.allowed).toBe(false);
        expect(user2First.allowed).toBe(true);
        expect(user2First.remaining).toBe(1);
    });

    test('should return correct resetAt timestamp', async () => {
        redis.incr.mockResolvedValue(1);
        redis.expire.mockResolvedValue(true);
        redis.ttl.mockResolvedValue(60);

        const beforeTimestamp = Math.floor(Date.now() / 1000);
        const result = await checkFixedWindow('user1', '/api/test', defaultConfig);

        expect(typeof result.resetAt).toBe('number');
        expect(result.resetAt).toBeGreaterThan(beforeTimestamp);
        expect(result.resetAt).toBeLessThanOrEqual(beforeTimestamp + 61);
    });

    test('should return allowed:true if Redis fails (fail-open)', async () => {
        redis.incr.mockRejectedValue(new Error('Redis connection refused'));

        const result = await checkFixedWindow('user1', '/api/test', defaultConfig);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(10);
        expect(result.algorithm).toBe('fixed-window');
    });

    test('should handle exactly at the limit boundary', async () => {
        const boundaryConfig = { limit: 5, windowSeconds: 60 };
        redis.ttl.mockResolvedValue(45);
        redis.expire.mockResolvedValue(true);

        redis.incr.mockResolvedValueOnce(1);
        await checkFixedWindow('user1', '/api/test', boundaryConfig);

        redis.incr.mockResolvedValueOnce(2);
        await checkFixedWindow('user1', '/api/test', boundaryConfig);

        redis.incr.mockResolvedValueOnce(3);
        await checkFixedWindow('user1', '/api/test', boundaryConfig);

        redis.incr.mockResolvedValueOnce(4);
        await checkFixedWindow('user1', '/api/test', boundaryConfig);

        redis.incr.mockResolvedValueOnce(5);
        const result5 = await checkFixedWindow('user1', '/api/test', boundaryConfig);

        expect(result5.allowed).toBe(true);
        expect(result5.remaining).toBe(0);

        redis.incr.mockResolvedValueOnce(6);
        const result6 = await checkFixedWindow('user1', '/api/test', boundaryConfig);

        expect(result6.allowed).toBe(false);
        expect(result6.remaining).toBe(0);
    });

    test('should use correct key format', () => {
        const key1 = generateKey('user123', '/api/search');
        expect(key1).toBe('fixed:user123:/api/search');

        const key2 = generateKey('192.168.1.1', '/health');
        expect(key2).toBe('fixed:192.168.1.1:/health');
    });

    test('should reset limit successfully', async () => {
        redis.ttl.mockResolvedValue(60);
        redis.expire.mockResolvedValue(true);

        redis.incr.mockResolvedValueOnce(1);
        await checkFixedWindow('user1', '/api/test', defaultConfig);

        redis.incr.mockResolvedValueOnce(2);
        await checkFixedWindow('user1', '/api/test', defaultConfig);

        redis.incr.mockResolvedValueOnce(3);
        await checkFixedWindow('user1', '/api/test', defaultConfig);

        redis.del.mockResolvedValue(1);
        const resetResult = await resetLimit('user1', '/api/test');
        expect(resetResult).toBe(true);

        redis.incr.mockResolvedValueOnce(1);
        const freshResult = await checkFixedWindow('user1', '/api/test', defaultConfig);

        expect(freshResult.allowed).toBe(true);
        expect(freshResult.remaining).toBe(9);
    });

    test('should handle different endpoints independently', async () => {
        const searchConfig = { limit: 30, windowSeconds: 60 };
        const dataConfig = { limit: 100, windowSeconds: 60 };
        redis.ttl.mockResolvedValue(55);
        redis.expire.mockResolvedValue(true);

        redis.incr.mockResolvedValueOnce(1);
        await checkFixedWindow('user1', '/api/search', searchConfig);

        redis.incr.mockResolvedValueOnce(2);
        await checkFixedWindow('user1', '/api/search', searchConfig);

        redis.incr.mockResolvedValueOnce(3);
        const searchResult = await checkFixedWindow('user1', '/api/search', searchConfig);

        redis.incr.mockResolvedValueOnce(1);
        await checkFixedWindow('user1', '/api/data', dataConfig);

        redis.incr.mockResolvedValueOnce(2);
        await checkFixedWindow('user1', '/api/data', dataConfig);

        redis.incr.mockResolvedValueOnce(3);
        const dataResult = await checkFixedWindow('user1', '/api/data', dataConfig);

        expect(searchResult.remaining).toBe(27);
        expect(dataResult.remaining).toBe(97);
    });
});
