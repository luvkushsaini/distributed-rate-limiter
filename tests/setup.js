/**
 * Global Jest test setup
 * Runs before all tests
 * Mocks Redis so tests don't need a real Redis connection
 */

// Mock the Redis client module
jest.mock('../src/store/redisClient', () => {
    const mockRedisClient = {
        incr: jest.fn(),
        expire: jest.fn(),
        ttl: jest.fn(),
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        isReady: true,
    };

    return {
        redisClient: mockRedisClient,
        connectRedis: jest.fn().mockResolvedValue(undefined),
        isRedisConnected: jest.fn().mockReturnValue(true),
    };
});
