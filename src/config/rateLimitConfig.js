/**
 * Default rate limit configuration
 * These rules are used when no custom rule is found for a tenant/user
 */
module.exports = {
    default: {
        limit: 100,
        windowSeconds: 60,
    },
    endpoints: {
        '/api/search': {
            limit: 30,
            windowSeconds: 60,
        },
        '/api/data': {
            limit: 100,
            windowSeconds: 60,
        },
        '/health': {
            limit: 1000,
            windowSeconds: 60,
        },
    },
};
