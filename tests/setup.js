jest.mock('../src/store/redisClient', () => {
    const mockRedis = {
        incr: jest.fn(),
        expire: jest.fn(),
        ttl: jest.fn(),
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        eval: jest.fn(),
        hgetall: jest.fn(),
        hset: jest.fn(),
        status: 'ready',
    };

    return {
        redis: mockRedis,
        connectRedis: jest.fn().mockResolvedValue(undefined),
        isRedisConnected: jest.fn().mockReturnValue(true),
    };
});
