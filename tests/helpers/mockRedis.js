// fake redis that stores everything in memory so tests don't need a real redis
const createMockRedis = () => {
    const store = {};
    const ttls = {};

    return {
        incr: jest.fn(async (key) => {
            store[key] = (store[key] || 0) + 1;
            return store[key];
        }),

        expire: jest.fn(async (key, seconds) => {
            ttls[key] = seconds;
            return 1;
        }),

        ttl: jest.fn(async (key) => {
            return ttls[key] || -1;
        }),

        get: jest.fn(async (key) => {
            return store[key] ? String(store[key]) : null;
        }),

        set: jest.fn(async (key, value, options) => {
            store[key] = value;
            if (options && options.EX) {
                ttls[key] = options.EX;
            }
            return 'OK';
        }),

        del: jest.fn(async (key) => {
            const existed = key in store;
            delete store[key];
            delete ttls[key];
            return existed ? 1 : 0;
        }),

        // clear everything between tests
        _reset: () => {
            Object.keys(store).forEach((k) => delete store[k]);
            Object.keys(ttls).forEach((k) => delete ttls[k]);
        },

        isReady: true,
    };
};

module.exports = { createMockRedis };
