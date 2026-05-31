// tests for the fixed window rate limiting algorithm
jest.mock('../src/store/redisClient', () => ({
    redis: {
        incr:   jest.fn(),
        expire: jest.fn(),
        ttl:    jest.fn(),
        del:    jest.fn(),
    },
}));

jest.mock('../src/utils/logger', () => ({
    info:  jest.fn(),
    error: jest.fn(),
    warn:  jest.fn(),
}));

const { checkFixedWindow, resetLimit } = require('../src/algorithms/fixedWindow');
const { redis } = require('../src/store/redisClient');

describe('Fixed Window Algorithm', () => {
    const config = { limit: 10, windowSeconds: 60 };

    beforeEach(() => jest.clearAllMocks());

    test('should allow request when under limit', async () => {
        redis.incr.mockResolvedValue(1);
        redis.expire.mockResolvedValue(true);
        redis.ttl.mockResolvedValue(60);

        const result = await checkFixedWindow('user_1', '/api/test', config);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(9);
        expect(result.algorithm).toBe('fixed-window');
    });

    test('should block request when limit is exceeded', async () => {
        redis.incr.mockResolvedValue(11);
        redis.ttl.mockResolvedValue(30);

        const result = await checkFixedWindow('user_1', '/api/test', config);

        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
    });

    test('should allow request exactly at the limit', async () => {
        redis.incr.mockResolvedValue(10);
        redis.ttl.mockResolvedValue(45);

        const result = await checkFixedWindow('user_1', '/api/test', config);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(0);
    });

    test('should let request through if redis is down', async () => {
        redis.incr.mockRejectedValue(new Error('Redis connection lost'));

        const result = await checkFixedWindow('user_1', '/api/test', config);

        expect(result.allowed).toBe(true);
    });

    test('should track different users separately', async () => {
        redis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
        redis.ttl.mockResolvedValue(60);

        const r1 = await checkFixedWindow('user_1', '/api/test', config);
        const r2 = await checkFixedWindow('user_2', '/api/test', config);

        expect(r1.allowed).toBe(true);
        expect(r2.allowed).toBe(true);
    });

    test('should delete the redis key when resetting', async () => {
        redis.del.mockResolvedValue(1);

        const result = await resetLimit('user_1', '/api/test');

        expect(result).toBe(true);
        expect(redis.del).toHaveBeenCalledWith('fixed:user_1:/api/test');
    });
});
