/**
 * Mock Redis helper for tests
 * Simulates Redis behavior in memory so tests run without a real Redis instance
 */

/**
 * Create a mock Redis client that simulates real Redis behavior in memory
 * This is useful for tests that need stateful Redis operations (INCR counting up, etc.)
 *
 * @returns {Object} A mock Redis client with in-memory store
 */
const createMockRedis = () => {
    const store = {};
    const ttls = {};

    return {
        /**
         * Atomically increment a key, create with value 1 if not exists
         * @param {string} key - Redis key to increment
         * @returns {Promise<number>} The new value after incrementing
         */
        incr: jest.fn(async (key) => {
            store[key] = (store[key] || 0) + 1;
            return store[key];
        }),

        /**
         * Set expiry on a key in seconds
         * @param {string} key - Redis key
         * @param {number} seconds - TTL in seconds
         * @returns {Promise<number>} 1 if set, 0 if key doesn't exist
         */
        expire: jest.fn(async (key, seconds) => {
            ttls[key] = seconds;
            return 1;
        }),

        /**
         * Get TTL of a key
         * @param {string} key - Redis key
         * @returns {Promise<number>} TTL in seconds, -1 if no expiry, -2 if key doesn't exist
         */
        ttl: jest.fn(async (key) => {
            return ttls[key] || -1;
        }),

        /**
         * Get value of a key
         * @param {string} key - Redis key
         * @returns {Promise<string|null>} The value, or null if key doesn't exist
         */
        get: jest.fn(async (key) => {
            return store[key] ? String(store[key]) : null;
        }),

        /**
         * Set a key with optional expiry
         * @param {string} key - Redis key
         * @param {string} value - Value to set
         * @param {Object} options - Optional { EX: seconds }
         * @returns {Promise<string>} 'OK'
         */
        set: jest.fn(async (key, value, options) => {
            store[key] = value;
            if (options && options.EX) {
                ttls[key] = options.EX;
            }
            return 'OK';
        }),

        /**
         * Delete a key
         * @param {string} key - Redis key
         * @returns {Promise<number>} 1 if key existed and was deleted, 0 otherwise
         */
        del: jest.fn(async (key) => {
            const existed = key in store;
            delete store[key];
            delete ttls[key];
            return existed ? 1 : 0;
        }),

        /**
         * Reset all stored data between tests
         * Call this in beforeEach to ensure test isolation
         */
        _reset: () => {
            Object.keys(store).forEach((k) => delete store[k]);
            Object.keys(ttls).forEach((k) => delete ttls[k]);
        },

        isReady: true,
    };
};

module.exports = { createMockRedis };
