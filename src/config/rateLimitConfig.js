/**
 * Rate limit config — per-endpoint overrides + default fallback.
 * `algorithm` can be 'fixed-window' or 'sliding-window'.
 */
module.exports = {
    default: {
        algorithm: 'fixed-window',
        limit: 100,
        windowSeconds: 60,
    },
    endpoints: {
        '/api/search': {
            algorithm: 'sliding-window',
            limit: 30,
            windowSeconds: 60,
        },
        '/api/data': {
            algorithm: 'token-bucket',
            capacity: 100,
            refillRate: 0.5,
        },
        '/health': {
            algorithm: 'fixed-window',
            limit: 1000,
            windowSeconds: 60,
        },
    },
};
